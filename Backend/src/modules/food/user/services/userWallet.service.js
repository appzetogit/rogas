import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, PaymentsError } from '../../../payments/payments.service.js';
import { resolvePaymentContext } from '../../../payments/payments.settings.js';

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    return FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description: 'Referral reward',
        metadata: { source: 'referral_reward', ...(metadata || {}) }
    });
    wallet.balance = Number(wallet.balance || 0) + amount;
    wallet.referralEarnings = Number(wallet.referralEarnings || 0) + amount;
    await wallet.save();
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

/** Credits a verified top-up. Idempotent per payment: the same payment can never add money twice. */
export const creditWalletFromPayment = async (userId, amount, meta = {}) => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) throw new ValidationError('Invalid top-up amount');
    const wallet = await ensureWallet(userId);
    await FoodUserWallet.updateOne(
        { _id: wallet._id, 'transactions.metadata.paymentTxId': { $ne: meta.paymentTxId } },
        {
            $inc: { balance: value },
            $push: {
                transactions: {
                    $each: [
                        {
                            type: 'addition',
                            amount: value,
                            status: 'Completed',
                            description: 'Wallet top-up',
                            metadata: { source: 'wallet_topup', ...meta },
                            razorpayOrderId: meta.provider === 'razorpay' ? meta.providerOrderId || null : null,
                            razorpayPaymentId: meta.provider === 'razorpay' ? meta.providerPaymentId || null : null
                        }
                    ],
                    $position: 0
                }
            }
        }
    );
    return { wallet: await getUserWallet(userId) };
};

/**
 * Starts a wallet top-up. The provider (Przelewy24 / Stripe / Razorpay) and the currency follow the customer's country.
 * `razorpay` in the result keeps the shape older clients expect.
 */
export const createWalletTopupOrder = async (userId, amountValue, opts = {}) => {
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    const user = await FoodUser.findById(userId).select('name email phone countryCode').lean();
    const ctx = await resolvePaymentContext({ zoneId: opts.zoneId, dialCode: user?.countryCode });
    try {
        const { payment } = await startPayment({
            purpose: 'wallet_topup',
            ownerType: 'user',
            ownerId: userId,
            amount,
            currency: ctx.currency,
            country: ctx.country,
            provider: opts.provider,
            description: 'Wallet top-up',
            customer: { name: user?.name, email: user?.email, phone: user?.phone },
            language: opts.language,
            returnPath: opts.returnPath || '/user/wallet',
            cancelPath: opts.cancelPath || '/user/wallet'
        });
        const data = { payment };
        if (payment.provider === 'razorpay') {
            data.razorpay = { key: payment.action.key, orderId: payment.action.orderId, amount: payment.action.amount, currency: payment.action.currency };
        }
        return data;
    } catch (err) {
        if (err instanceof PaymentsError) throw new ValidationError(err.message);
        throw err;
    }
};

/** Razorpay only: the browser reports the pop-up result. The credited amount comes from our payment record, not the request. */
export const verifyWalletTopupPayment = async (userId, payload) => {
    const tx = await findOwnedTransaction({
        publicId: payload?.transactionId,
        providerOrderId: String(payload?.razorpayOrderId || '').trim(),
        purpose: 'wallet_topup',
        ownerId: userId
    });
    if (!tx) throw new ValidationError('Payment not found');
    try {
        const after = await confirmRazorpayPayment(tx, payload);
        if (!['paid', 'partially_refunded', 'refunded'].includes(after.status)) throw new ValidationError('Payment is not completed yet');
    } catch (err) {
        if (err instanceof PaymentsError) throw new ValidationError(err.message);
        throw err;
    }
    return { wallet: await getUserWallet(userId) };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    const wallet = await ensureWallet(userId);
    if (wallet.balance < amount) {
        throw new ValidationError('Insufficient wallet balance');
    }

    wallet.transactions.unshift({
        type: 'deduction',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_payment', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) - amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'refund',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_refund', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) + amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};

export const topupUserWalletByAdmin = async (userId, amountInr, adminId, description = 'Admin Top-up') => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid top-up amount');
    }

    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'admin_topup', adminId: String(adminId) }
    });

    wallet.balance = Number(wallet.balance || 0) + amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};
