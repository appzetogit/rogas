import express from 'express';
import { handleRazorpayWebhook } from '../controllers/razorpayWebhook.controller.js';
import { providerWebhook } from '../../../modules/payments/payments.routes.js';

/** ✅ NEW: Webhook Routes Module */
const router = express.Router();

/**
 * Endpoint for Razorpay payment/refund events (Public)
 * Path: /api/v1/payments/webhook/razorpay
 */
router.post('/razorpay', handleRazorpayWebhook);

/**
 * Przelewy24 payment/refund notifications (Public, signature verified)
 * Path: /api/v1/payments/webhook/przelewy24
 */
router.post('/przelewy24', providerWebhook('przelewy24'));

/**
 * Stripe events (Public, Stripe-Signature verified against the raw body)
 * Path: /api/v1/payments/webhook/stripe
 */
router.post('/stripe', providerWebhook('stripe'));

export default router;
