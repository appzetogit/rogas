import express from 'express';
import Razorpay from 'razorpay';
import crypto from 'crypto';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { createSubscription, activateSubscription } from '../subscription/subscription.service.js';
import { logger } from '../../../utils/logger.js';

const router = express.Router();

const getRazorpay = () => new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/**
 * POST /api/v1/dmb/payments/create-order
 * Step 1: Create Razorpay order + pending DMB subscription
 * Body: { vendorId, mealPlanId, deliveryDays, deliverySlot, deliveryAddress, pricing }
 */
router.post('/create-order', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const {
            vendorId,
            zoneId,
            mealPlanId,
            meals,
            duration,
            deliveryDays,
            deliverySlot,
            deliverySlots,
            deliveryAddress,
            pricing,
            invoiceType,
            companyNip,
            companyName,
            billingEmail
        } = req.body;

        const finalMeals = meals || (mealPlanId ? [{ mealPlanId, quantity: 1 }] : []);
        const finalSlots = deliverySlots && deliverySlots.length > 0
            ? deliverySlots
            : (deliverySlot ? [deliverySlot] : []);
        const finalSlot = deliverySlot || (finalSlots.length > 0 ? finalSlots[0] : 'lunch');

        if (!vendorId || finalMeals.length === 0 || finalSlots.length === 0 || !deliveryAddress || !pricing) {
            return res.status(400).json({ success: false, message: 'vendorId, meals/mealPlanId, deliverySlots, deliveryAddress, and pricing are required' });
        }

        const userId = req.user.userId || req.user._id;
        const targetPrice = pricing.totalPrice !== undefined ? pricing.totalPrice : pricing.totalPerWeek;
        const amountPaise = Math.round(targetPrice * 100); // Convert INR to paise

        // Create Razorpay order
        const razorpay = getRazorpay();
        const razorpayOrder = await razorpay.orders.create({
            amount: amountPaise,
            currency: 'INR',
            receipt: `DMB-${Date.now()}`,
            notes: {
                userId: String(userId),
                vendorId,
                mealPlanId: mealPlanId || (finalMeals[0] && String(finalMeals[0].mealPlanId)) || '',
                deliverySlot: finalSlot
            }
        });

        // Create pending subscription in DB
        const subscription = await createSubscription({
            userId,
            vendorId,
            zoneId,
            mealPlanId: mealPlanId || undefined,
            meals: finalMeals,
            duration: duration || 'weekly',
            deliveryDays: deliveryDays || 'mon_fri',
            deliverySlot: finalSlot,
            deliverySlots: finalSlots,
            deliveryAddress,
            pricing,
            paymentMethod: 'razorpay',
            invoiceType: invoiceType || 'receipt',
            companyNip,
            companyName,
            billingEmail
        });

        logger.info(`DMB payment order created: razorpayOrderId=${razorpayOrder.id}, subscriptionId=${subscription.subscriptionId}`);

        res.status(201).json({
            success: true,
            razorpayOrderId: razorpayOrder.id,
            razorpayKeyId: process.env.RAZORPAY_KEY_ID,
            amount: amountPaise,
            currency: 'INR',
            subscription: {
                subscriptionId: subscription.subscriptionId,
                _id: subscription._id,
                status: subscription.status
            }
        });
    } catch (err) {
        logger.error(`DMB create-order error: ${err.message}`);
        res.status(400).json({ success: false, message: err.message });
    }
});

/**
 * POST /api/v1/dmb/payments/verify-payment
 * Step 2: Verify Razorpay signature → activate subscription
 * Body: { razorpayOrderId, razorpayPaymentId, razorpaySignature, subscriptionId }
 */
router.post('/verify-payment', authMiddleware, requireRoles('USER'), async (req, res) => {
    try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature, subscriptionId } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !subscriptionId) {
            return res.status(400).json({ success: false, message: 'All payment fields are required' });
        }

        // Verify Razorpay signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest('hex');

        if (expectedSignature !== razorpaySignature) {
            logger.warn(`DMB payment signature mismatch for order ${razorpayOrderId}`);
            return res.status(400).json({ success: false, message: 'Payment verification failed: invalid signature' });
        }

        // Activate the subscription
        const subscription = await activateSubscription(subscriptionId);

        logger.info(`DMB subscription activated: ${subscriptionId}, payment: ${razorpayPaymentId}`);

        res.json({
            success: true,
            message: '🎉 Subscription confirmed! Your first meal box is on its way.',
            subscription
        });
    } catch (err) {
        logger.error(`DMB verify-payment error: ${err.message}`);
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
