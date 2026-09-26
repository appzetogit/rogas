import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { createSubscription } from '../subscription/subscription.service.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { VendorSubscriptionPlan } from '../subscription/vendorSubscriptionPlan.model.js';
import { logger } from '../../../utils/logger.js';
import { assertValidSlotKeys } from '../deliverySlot/deliverySlot.service.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, PaymentsError } from '../../payments/payments.service.js';
import { resolvePaymentContext, resolveProviders } from '../../payments/payments.settings.js';

const router = express.Router();

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * The total is calculated in the customer's browser, so the server refuses anything below what the plan itself costs
 * (VAT can only add to it). Without this a customer could edit the request and pay a fraction of the price.
 */
const assertPriceFloor = async ({ subscriptionPlanId, slots, pricing }) => {
    if (!subscriptionPlanId) {
        logger.warn('Subscription checkout without subscriptionPlanId: price floor not verified');
        return;
    }
    const plan = await VendorSubscriptionPlan.findById(subscriptionPlanId).lean();
    if (!plan || plan.status !== 'active') throw new Error('This subscription plan is no longer available');
    const monFri = plan.deliveryDays === 'mon_fri';
    const days = plan.duration === 'day' ? 1 : plan.duration === 'week' ? (monFri ? 5 : 7) : (monFri ? 20 : 30);
    let feePerOrder = 0;
    try {
        const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
        const cfg = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
        feePerOrder = Number(cfg?.feePerOrder) || 0;
    } catch {
        /* no fee configured */
    }
    const floor = round2(plan.price * slots + days * slots * feePerOrder + (Number(plan.platformFee) || 0));
    const total = Number(pricing.totalPrice !== undefined ? pricing.totalPrice : pricing.totalPerWeek);
    if (!Number.isFinite(total) || total + 0.01 < floor) {
        throw new Error('The price has changed. Please reload the plan and try again.');
    }
};

/**
 * POST /api/v1/dmb/payments/create-order
 * Step 1: create the pending subscription and start a payment with the provider chosen for the customer's country.
 * Body: { vendorId, zoneId, meals, duration, deliveryDays, deliverySlots, deliveryAddress, pricing, subscriptionPlanId?,
 *         provider?, returnPath?, cancelPath?, language? }
 * The subscription is activated by the payment webhook (or, for Razorpay, by the confirmation below).
 */
router.post('/create-order', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    let subscription = null;
    const userId = req.user?.userId || req.user?._id;
    try {
        const {
            vendorId, zoneId, mealPlanId, meals, duration, deliveryDays, deliverySlot, deliverySlots, deliveryAddress, pricing,
            invoiceType, companyNip, companyName, billingEmail, startDate, subscriptionPlanId, provider, returnPath, cancelPath, language
        } = req.body;

        const finalMeals = meals || (mealPlanId ? [{ mealPlanId, quantity: 1 }] : []);
        const finalSlots = deliverySlots && deliverySlots.length > 0 ? deliverySlots : (deliverySlot ? [deliverySlot] : []);
        if (!vendorId || finalMeals.length === 0 || finalSlots.length === 0 || !deliveryAddress || !pricing) {
            return res.status(400).json({ success: false, message: 'vendorId, meals/mealPlanId, deliverySlots, deliveryAddress, and pricing are required' });
        }

        await assertValidSlotKeys(finalSlots);
        const targetPrice = Number(pricing.totalPrice !== undefined ? pricing.totalPrice : pricing.totalPerWeek);
        if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid total price' });
        }
        await assertPriceFloor({ subscriptionPlanId, slots: finalSlots.length, pricing });

        const user = await FoodUser.findById(userId).select('name email phone countryCode').lean();
        const ctx = await resolvePaymentContext({ zoneId, dialCode: user?.countryCode });
        // Fail early (before creating anything) when there is no way to take payment for this customer.
        const available = await resolveProviders({ country: ctx.country, currency: ctx.currency });
        if (!available.length) {
            return res.status(503).json({ success: false, code: 'NO_PROVIDER', message: 'No payment method is available for your region right now. Please contact support.' });
        }
        if (provider && !available.includes(provider)) {
            return res.status(400).json({ success: false, code: 'PROVIDER_NOT_AVAILABLE', message: 'That payment method is not available' });
        }
        const chosen = provider || available[0];

        subscription = await createSubscription({
            userId,
            vendorId,
            zoneId,
            mealPlanId: mealPlanId || undefined,
            meals: finalMeals,
            duration: duration || 'weekly',
            deliveryDays: deliveryDays || 'mon_fri',
            deliverySlot: finalSlots[0],
            deliverySlots: finalSlots,
            deliveryAddress,
            pricing: { ...pricing, currency: ctx.currency },
            paymentMethod: chosen === 'mock' ? 'cash' : chosen,
            invoiceType: invoiceType || 'receipt',
            companyNip,
            companyName,
            billingEmail,
            startDate: startDate || null
        });

        const { payment } = await startPayment({
            purpose: 'subscription',
            ownerType: 'user',
            ownerId: userId,
            amount: targetPrice,
            currency: ctx.currency,
            country: ctx.country,
            provider: chosen,
            description: `DailyMealBox subscription ${subscription.subscriptionId}`,
            customer: { name: companyName || user?.name, email: billingEmail || user?.email, phone: user?.phone },
            language,
            returnPath: returnPath || '/user/orders',
            cancelPath: cancelPath || '/user/plans',
            refs: { subscriptionId: subscription.subscriptionId },
            metadata: { vendorId: String(vendorId), zoneId: zoneId ? String(zoneId) : '' }
        });

        logger.info(`DMB payment started: ${payment.transactionId} (${payment.provider}) for subscription ${subscription.subscriptionId}`);

        const body = {
            success: true,
            payment,
            subscription: { subscriptionId: subscription.subscriptionId, _id: subscription._id, status: subscription.status }
        };
        if (payment.provider === 'razorpay') {
            // Fields the existing checkout screen reads.
            Object.assign(body, { razorpayOrderId: payment.action.orderId, razorpayKeyId: payment.action.key, amount: payment.action.amount, currency: payment.action.currency });
        }
        return res.status(201).json(body);
    } catch (err) {
        // Nothing was paid, so do not leave a half-made subscription behind.
        if (subscription) {
            await DMBSubscription.deleteOne({ _id: subscription._id, status: 'pending_payment' }).catch(() => {});
            const other = await DMBSubscription.exists({ userId, status: { $in: ['active', 'paused'] } });
            if (!other) await FoodUser.updateOne({ _id: userId, subscriptionStatus: 'active' }, { subscriptionStatus: 'none' }).catch(() => {});
        }
        logger.error(`DMB create-order error: ${err.message}`);
        if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
        return res.status(400).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/dmb/payments/verify-payment  (Razorpay only)
 * Step 2 for the pop-up flow: the browser reports the signed result. Hosted-page providers (Przelewy24, Stripe) never
 * call this: their webhook activates the subscription and the return page just shows the outcome.
 * Body: { subscriptionId?, transactionId?, razorpayOrderId, razorpayPaymentId, razorpaySignature }
 */
router.post('/verify-payment', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user?.userId || req.user?._id;
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, subscriptionId, transactionId } = req.body;
        if (!transactionId && (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature)) {
            return res.status(400).json({ success: false, message: 'All payment fields are required' });
        }

        const tx = await findOwnedTransaction({ publicId: transactionId, providerOrderId: razorpayOrderId, purpose: 'subscription', ownerId: userId });
        if (!tx) return res.status(404).json({ success: false, message: 'Payment not found' });
        const owned = await DMBSubscription.findOne({ subscriptionId: tx.refs?.subscriptionId }).select('_id subscriptionId').lean();
        if (subscriptionId && owned && ![owned.subscriptionId, String(owned._id)].includes(String(subscriptionId))) {
            return res.status(400).json({ success: false, message: 'Payment does not belong to this subscription' });
        }

        const after = await confirmRazorpayPayment(tx, req.body);
        if (!['paid', 'partially_refunded', 'refunded'].includes(after.status)) {
            return res.status(400).json({ success: false, message: 'Payment is not completed yet' });
        }
        const subscription = await DMBSubscription.findOne({ subscriptionId: tx.refs?.subscriptionId });
        logger.info(`DMB subscription payment confirmed: ${tx.refs?.subscriptionId}, payment: ${after.providerPaymentId}`);

        res.json({ success: true, message: '🎉 Subscription confirmed! Your first meal box is on its way.', subscription });
    } catch (err) {
        logger.error(`DMB verify-payment error: ${err.message}`);
        const status = err instanceof PaymentsError ? err.statusCode : 400;
        res.status(status).json({ success: false, message: err.message });
    }
});

export default router;
