import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodDeliveryWithdrawal } from '../models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, PaymentsError } from '../../../payments/payments.service.js';
import { resolvePaymentContext } from '../../../payments/payments.settings.js';

/**
 * Enhanced wallet fetch for delivery partners.
 * Integrates:
 * 1. Historical orders (earnings)
 * 2. Admin bonuses
 * 3. Withdrawals (pending/payout)
 * 4. Cash collected vs limit
 */
export const getDeliveryPartnerWalletEnhanced = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const partner = await FoodDeliveryPartner.findById(partnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const [cashLimitSettings, earningsAgg, bonusAgg, withdrawalAgg, withdrawalsList, depositList] = await Promise.all([
        getDeliveryCashLimitSettings(),
        // 1. Total Earnings from Delivered Orders
        FoodOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' } },
            { $group: { _id: null, totalEarned: { $sum: { $ifNull: ['$riderEarning', 0] } }, totalTips: { $sum: { $ifNull: ['$tipAmount', 0] } } } }
        ]),
        // 2. Admin Bonuses
        DeliveryBonusTransaction.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 3. Withdrawal Aggregates (Approved vs Pending)
        FoodDeliveryWithdrawal.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            {
                $group: {
                    _id: null,
                    totalWithdrawn: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } },
                    pendingWithdrawals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                }
            }
        ]),
        // 4. Recent Withdrawals for History
        FoodDeliveryWithdrawal.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean(),
        FoodDeliveryCashDeposit.find({ deliveryPartnerId: partnerId })
            .sort({ createdAt: -1 })
            .limit(50)
            .lean()
    ]);

    // ── Cash-in-Hand: COD collected SINCE last deposit ─────────────────────────
    // Find the most recent completed deposit date (cutoff point)
    const lastDepositDoc = depositList?.find(d => String(d.status || '').toLowerCase() === 'completed');
    const lastDepositAt = lastDepositDoc?.createdAt || null;

    // Sum COD orders delivered AFTER the last deposit (or all time if no deposit)
    const cashInHandMatchStage = {
        'dispatch.deliveryPartnerId': partnerId,
        orderStatus: 'delivered',
        ...(lastDepositAt ? { createdAt: { $gt: new Date(lastDepositAt) } } : {})
    };

    const dmbCashInHandMatchStage = {
        'dispatch.deliveryPartnerId': partnerId,
        status: 'delivered',
        paymentMethod: 'CASH',
        ...(lastDepositAt ? { createdAt: { $gt: new Date(lastDepositAt) } } : {})
    };

    const { DMBDailyOrder } = await import('../../../dailymealbox/subscription/dmb.dailyOrder.model.js');

    const [cashCollectedAgg, dmbCashCollectedAgg, dmbEarningsAgg] = await Promise.all([
        FoodOrder.aggregate([
            { $match: cashInHandMatchStage },
            {
                $lookup: {
                    from: 'food_transactions',
                    localField: '_id',
                    foreignField: 'orderId',
                    as: 'tx'
                }
            },
            {
                $match: {
                    $or: [
                        { 'tx.paymentMethod': 'cash' },
                        { 'tx': { $size: 0 }, 'payment.method': 'cash' }
                    ]
                }
            },
            { $group: { _id: null, cashCollected: { $sum: { $add: [{ $ifNull: ['$pricing.total', 0] }, { $ifNull: ['$riderEarning', 0] }] } } } }
        ]),
        DMBDailyOrder.aggregate([
            { $match: dmbCashInHandMatchStage },
            { $group: { _id: null, cashCollected: { $sum: { $add: [{ $ifNull: ['$riderEarning', 0] }] } } } }
        ]),
        DMBDailyOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, status: 'delivered' } },
            { $group: { _id: null, totalEarned: { $sum: { $ifNull: ['$riderEarning', 0] } }, totalTips: { $sum: { $ifNull: ['$driverTip', 0] } } } }
        ])
    ]);

    const totalEarnedFee = (Number(earningsAgg?.[0]?.totalEarned) || 0) + (Number(dmbEarningsAgg?.[0]?.totalEarned) || 0);
    const totalTips = (Number(earningsAgg?.[0]?.totalTips) || 0) + (Number(dmbEarningsAgg?.[0]?.totalTips) || 0);
    const totalEarned = totalEarnedFee + totalTips;
    // Cash in hand = COD collected since last deposit (no subtraction needed - already scoped by date)
    const cashInHand = Math.max(0, (Number(cashCollectedAgg?.[0]?.cashCollected) || 0) + (Number(dmbCashCollectedAgg?.[0]?.cashCollected) || 0));
    const totalBonus = Number(bonusAgg?.[0]?.total) || 0;
    const totalWithdrawn = Number(withdrawalAgg?.[0]?.totalWithdrawn) || 0;
    const pendingWithdrawals = Number(withdrawalAgg?.[0]?.pendingWithdrawals) || 0;

    const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
    const deliveryWithdrawalLimit = Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;

    // Pocket Balance = (Earnings + Bonus) - Total Withdrawn (approved) - Pending Withdrawals
    // Wait, usually pocket balance subtracts pending too so user knows how much is "left" to request.
    const pocketBalance = Math.max(0, (totalEarned + totalBonus) - (totalWithdrawn + pendingWithdrawals));

    // Fetch transactions for UI (Orders, Bonuses, Withdrawals)
    const [ordersTx] = await Promise.all([
        FoodOrder.find({ 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' })
            .sort({ createdAt: -1 })
            .select('orderId riderEarning payment orderStatus createdAt')
            .limit(20)
            .lean(),
    ]);

    const transactions = [
        ...(ordersTx || []).map(o => ({
            id: o._id,
            type: 'payment',
            amount: o.riderEarning || 0,
            status: 'Completed',
            date: o.createdAt,
            description: o.payment?.method === 'cash' ? 'COD delivery earning' : 'Online delivery earning',
            orderId: o.orderId
        })),
        ...(withdrawalsList || []).map(w => ({
            id: w._id,
            type: 'withdrawal',
            amount: w.amount,
            status: w.status === 'pending' ? 'Pending' : (w.status === 'approved' ? 'Completed' : 'Rejected'),
            date: w.createdAt,
            description: `Withdrawal Request - ${w.paymentMethod}`,
            payoutMethod: w.paymentMethod
        })),
        ...(depositList || []).map(d => ({
            id: d._id,
            type: 'deposit',
            amount: d.amount,
            status: d.status || 'Pending',
            date: d.createdAt,
            description: 'Cash limit settlement',
            paymentMethod: d.paymentMethod || 'cash',
            razorpayPaymentId: d.razorpayPaymentId || '',
            razorpayOrderId: d.razorpayOrderId || ''
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
        totalBalance: totalEarned + totalBonus, // Gross lifetime earnings
        pocketBalance, // Available to withdraw
        cashInHand, // COD to be deposited/deducted
        totalWithdrawn, // Actually paid out
        pendingWithdrawals, // In process
        totalEarned,
        totalBonus,
        totalCashLimit,
        availableCashLimit: Math.max(0, totalCashLimit - cashInHand),
        deliveryWithdrawalLimit,
        transactions: transactions.slice(0, 50)
    };
};

/**
 * Submits a new withdrawal request for a delivery partner.
 */
export const requestDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
    const { amount, bankDetails, paymentMethod = 'bank_transfer' } = payload;

    if (!amount || amount < 1) throw new ValidationError('Invalid amount');

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount < wallet.deliveryWithdrawalLimit) {
        throw new ValidationError(`Minimum withdrawal amount is ₹${wallet.deliveryWithdrawalLimit}`);
    }
    if (amount > wallet.pocketBalance) {
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const withdrawal = await FoodDeliveryWithdrawal.create({
        deliveryPartnerId,
        amount,
        paymentMethod,
        bankDetails: bankDetails || {
            accountNumber: partner.bankAccountNumber,
            ifscCode: partner.bankIfscCode,
            bankName: partner.bankName,
            accountHolderName: partner.bankAccountHolderName
        },
        upiId: partner.upiId,
        upiQrCode: partner.upiQrCode,
        status: 'pending'
    });

    return withdrawal;
};

/**
 * A driver pays (part of) the cash they hold to the platform. The provider and currency follow the driver's country;
 * the deposit row itself is only written once the money has really arrived (see the driver_deposit payment purpose).
 * `razorpay` in the result keeps the shape older clients expect.
 */
export const createDeliveryCashDepositOrder = async (deliveryPartnerId, amountValue, opts = {}) => {
    const amount = Number(amountValue);
    if (!Number.isFinite(amount) || amount < 1) {
        throw new ValidationError('Amount must be at least 1');
    }
    if (amount > 500000) {
        throw new ValidationError('Maximum deposit is 500,000');
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select('name email phone countryCode').lean();
    const ctx = await resolvePaymentContext({ zoneId: opts.zoneId, dialCode: partner?.countryCode });
    try {
        const { payment } = await startPayment({
            purpose: 'driver_deposit',
            ownerType: 'driver',
            ownerId: deliveryPartnerId,
            amount,
            currency: ctx.currency,
            country: ctx.country,
            provider: opts.provider,
            description: 'Cash deposit',
            customer: { name: partner?.name, email: partner?.email, phone: partner?.phone },
            language: opts.language,
            returnPath: opts.returnPath || '/food/delivery/pocket',
            cancelPath: opts.cancelPath || '/food/delivery/pocket'
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

/** Razorpay only: the app reports the pop-up result; the deposited amount is the one stored on our payment record. */
export const verifyDeliveryCashDepositPayment = async (deliveryPartnerId, payload = {}) => {
    const tx = await findOwnedTransaction({
        publicId: payload?.transactionId,
        providerOrderId: String(payload?.razorpayOrderId || '').trim(),
        purpose: 'driver_deposit',
        ownerId: deliveryPartnerId
    });
    if (!tx) throw new ValidationError('Payment not found');
    try {
        const after = await confirmRazorpayPayment(tx, payload);
        if (!['paid', 'partially_refunded', 'refunded'].includes(after.status)) throw new ValidationError('Payment is not completed yet');
    } catch (err) {
        if (err instanceof PaymentsError) throw new ValidationError(err.message);
        throw err;
    }
    const deposit = await FoodDeliveryCashDeposit.findOne({ paymentTransactionId: tx.publicId }).lean();
    return { deposit, wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId) };
};
