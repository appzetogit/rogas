import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { VendorSubscriptionPlan } from '../subscription/vendorSubscriptionPlan.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { logger } from '../../../utils/logger.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, PaymentsError } from '../../payments/payments.service.js';
import { resolvePaymentContext, resolveProviders } from '../../payments/payments.settings.js';

const router = express.Router();

const round2 = (n) => Math.round(Number(n) * 100) / 100;

/**
 * The total is calculated in the customer's browser, so the server refuses anything below what the order itself
 * costs (VAT can only add to it). Without this a customer could edit the request and pay a fraction of the price.
 * The food price is the vendor's own DMBMealPlan.pricePerDay (Menu Management) — never admin-set; the duration
 * (day count), delivery fee and platform fee are the admin's shared plan policy.
 */
export const assertPriceFloor = async ({ subscriptionPlanId, slots, pricing, meals }) => {
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
    const mealDocs = await DMBMealPlan.find({ _id: { $in: (meals || []).map((m) => m.mealPlanId) } }).select('pricePerDay').lean();
    const priceById = Object.fromEntries(mealDocs.map((d) => [String(d._id), d.pricePerDay]));
    const foodPerDay = (meals || []).reduce((sum, m) => sum + (priceById[String(m.mealPlanId)] || 0) * (Number(m.quantity) || 1), 0);
    const floor = round2(foodPerDay * days * slots + days * slots * feePerOrder + (Number(plan.platformFee) || 0));
    const total = Number(pricing.totalPrice !== undefined ? pricing.totalPrice : pricing.totalPerWeek);
    if (!Number.isFinite(total) || total + 0.01 < floor) {
        throw new Error('The price has changed. Please reload the plan and try again.');
    }
};

/** Starts the provider payment for a pending subscription and shapes the response the checkout screen reads. */
export const startSubscriptionPayment = async ({ userId, subscription, amount, zoneId, provider, returnPath, cancelPath, language, description }) => {
    const user = await FoodUser.findById(userId).select('name email phone countryCode').lean();
    const ctx = await resolvePaymentContext({ zoneId, dialCode: user?.countryCode });
    const available = await resolveProviders({ country: ctx.country, currency: ctx.currency });
    if (!available.length) throw new PaymentsError('No payment method is available for your region right now. Please contact support.', 503, 'NO_PROVIDER');
    if (provider && !available.includes(provider)) throw new PaymentsError('That payment method is not available', 400, 'PROVIDER_NOT_AVAILABLE');
    const chosen = provider || available[0];
    const { payment } = await startPayment({
        purpose: 'subscription',
        ownerType: 'user',
        ownerId: userId,
        amount,
        currency: ctx.currency,
        country: ctx.country,
        provider: chosen,
        description: description || `DailyMealBox subscription ${subscription.subscriptionId}`,
        customer: { name: subscription.companyName || user?.name, email: subscription.billingEmail || user?.email, phone: user?.phone },
        language,
        returnPath: returnPath || '/user/orders',
        cancelPath: cancelPath || '/user/plans',
        refs: { subscriptionId: subscription.subscriptionId },
        metadata: { vendorId: String(subscription.vendorId), zoneId: zoneId ? String(zoneId) : '' }
    });
    const body = {
        success: true,
        payment,
        subscription: { subscriptionId: subscription.subscriptionId, _id: subscription._id, status: subscription.status }
    };
    if (payment.provider === 'razorpay') {
        // Fields the existing checkout screen reads.
        Object.assign(body, { razorpayOrderId: payment.action.orderId, razorpayKeyId: payment.action.key, amount: payment.action.amount, currency: payment.action.currency });
    }
    return { body, provider: chosen };
};

const quoteInputFrom = (b) => ({
    subscriptionPlanId: b.subscriptionPlanId,
    vendorId: b.vendorId,
    zoneId: b.zoneId,
    startDate: b.startDate,
    subscriptionType: b.subscriptionType,
    meals: b.meals || (b.mealPlanId ? [{ mealPlanId: b.mealPlanId, quantity: 1 }] : []),
    deliverySlots: b.deliverySlots?.length ? b.deliverySlots : (b.deliverySlot ? [b.deliverySlot] : []),
    deliveryDays: b.deliveryDays,
    deliveryDaysList: b.deliveryDaysList,
    daySlots: b.daySlots,
    familyBox: b.familyBox,
    rotation: b.rotation
});

const sendQuoteError = (res, err) => {
    const status = err.statusCode || 400;
    return res.status(status).json({ success: false, code: err.code, message: err.message, details: err.details, quote: err.quote });
};

/**
 * POST /api/v1/dmb/payments/quote — the authoritative price of a subscription before checkout (no side effects).
 * Body: same as create-order (subscriptionPlanId, vendorId, zoneId, meals, deliverySlots, deliveryDays, deliveryDaysList,
 *       daySlots, startDate, familyBox, rotation, subscriptionType).
 */
router.post('/quote', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { quoteSubscription } = await import('../subscription/pricing.service.js');
        const quote = await quoteSubscription(quoteInputFrom(req.body || {}), { userId: req.user?.userId || req.user?._id });
        res.json({ success: true, quote });
    } catch (err) {
        sendQuoteError(res, err);
    }
});

/**
 * POST /api/v1/dmb/payments/create-order
 * Step 1: create the pending subscription at the server's quoted price and start a payment with the provider chosen for
 * the customer's country. Body: quote fields + { deliveryAddress | addressId, dayAddresses?, expectedTotal (the total the
 * customer saw), invoiceType, companyNip, companyName, billingEmail, provider?, returnPath?, cancelPath?, language? }.
 * The subscription is activated by the payment webhook (or, for Razorpay, by the confirmation below).
 */
router.post('/create-order', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    let subscription = null;
    const userId = req.user?.userId || req.user?._id;
    try {
        const b = req.body || {};
        if (!b.subscriptionPlanId) {
            return res.status(400).json({ success: false, code: 'PLAN_REQUIRED', message: 'Choose a subscription plan' });
        }
        const { createPendingSubscription } = await import('../subscription/subscriptionCheckout.service.js');
        const expected = b.expectedTotal ?? b.pricing?.totalPrice;
        const created = await createPendingSubscription({
            userId,
            input: quoteInputFrom(b),
            deliveryAddress: b.addressId || b.deliveryAddress,
            dayAddresses: b.dayAddresses,
            expectedTotal: expected,
            paymentMethod: b.provider === 'mock' ? 'cash' : (b.provider || undefined),
            invoice: { invoiceType: b.invoiceType || 'receipt', companyNip: b.companyNip, companyName: b.companyName, billingEmail: b.billingEmail }
        });
        subscription = created.subscription;

        const { body, provider } = await startSubscriptionPayment({
            userId, subscription, amount: created.quote.totals.total, zoneId: created.quote.zoneId,
            provider: b.provider, returnPath: b.returnPath, cancelPath: b.cancelPath, language: b.language
        });
        if (subscription.paymentMethod !== provider) await subscription.updateOne({ paymentMethod: provider === 'mock' ? 'cash' : provider });
        logger.info(`DMB payment started: ${body.payment.transactionId} (${provider}) for subscription ${subscription.subscriptionId}, total ${created.quote.totals.total}`);
        body.quote = created.quote;
        return res.status(201).json(body);
    } catch (err) {
        // Nothing was paid, so do not leave a half-made subscription behind.
        if (subscription) {
            await DMBSubscription.deleteOne({ _id: subscription._id, status: 'pending_payment' }).catch(() => {});
        }
        logger.error(`DMB create-order error: ${err.message}`);
        if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
        return sendQuoteError(res, err);
    }
});

/** POST /api/v1/dmb/payments/change/preview — Gap S: what an upgrade / downgrade / vendor switch / extra slot would do. */
router.post('/change/preview', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { previewChange } = await import('../subscription/subscriptionCheckout.service.js');
        const preview = await previewChange({ userId: req.user?.userId || req.user?._id, subscriptionId: req.body?.subscriptionId, type: req.body?.type, input: req.body?.input || {} });
        delete preview.quoteInput;
        res.json({ success: true, preview });
    } catch (err) {
        sendQuoteError(res, err);
    }
});

/** POST /api/v1/dmb/payments/change — creates the replacement subscription and starts its payment. */
router.post('/change', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    let subscription = null;
    const userId = req.user?.userId || req.user?._id;
    try {
        const b = req.body || {};
        const { createChangeSubscription } = await import('../subscription/subscriptionCheckout.service.js');
        const created = await createChangeSubscription({ userId, subscriptionId: b.subscriptionId, type: b.type, input: b.input || {}, expectedTotal: b.expectedTotal });
        subscription = created.subscription;
        const { body } = await startSubscriptionPayment({
            userId, subscription, amount: created.quote.totals.total, zoneId: created.quote.zoneId,
            provider: b.provider, returnPath: b.returnPath, cancelPath: b.cancelPath || '/user/profile', language: b.language,
            description: `DailyMealBox ${created.preview.changeType.replace('_', ' ')} ${subscription.subscriptionId}`
        });
        body.quote = created.quote;
        body.preview = { changeType: created.preview.changeType, effectiveDate: created.preview.effectiveDate, credit: created.preview.credit };
        return res.status(201).json(body);
    } catch (err) {
        if (subscription) await DMBSubscription.deleteOne({ _id: subscription._id, status: 'pending_payment' }).catch(() => {});
        logger.error(`DMB change error: ${err.message}`);
        if (err instanceof PaymentsError) return res.status(err.statusCode).json({ success: false, code: err.code, message: err.message });
        return sendQuoteError(res, err);
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
