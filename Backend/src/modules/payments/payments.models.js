import crypto from 'crypto';
import mongoose from 'mongoose';

export const PROVIDER_IDS = ['razorpay', 'przelewy24', 'stripe', 'mock'];
export const PURPOSES = ['subscription', 'pantry', 'wallet_topup', 'tip', 'office', 'driver_deposit', 'one_time_order'];
export const TX_STATUSES = ['created', 'pending', 'paid', 'failed', 'expired', 'cancelled', 'partially_refunded', 'refunded'];

const refundSchema = new mongoose.Schema(
    {
        refundKey: { type: String, required: true },
        amountMinor: { type: Number, required: true, min: 1 },
        status: { type: String, enum: ['pending', 'processed', 'failed'], default: 'pending' },
        providerRefundId: { type: String, default: '' },
        reason: { type: String, default: '' },
        requestedBy: { type: String, default: '' },
        error: { type: String, default: '' }
    },
    { _id: true, timestamps: true }
);

const eventSchema = new mongoose.Schema(
    {
        at: { type: Date, default: Date.now },
        type: { type: String, required: true },
        source: { type: String, default: '' },
        note: { type: String, default: '' }
    },
    { _id: false }
);

/**
 * One row per attempt to collect money, whatever the provider or purpose. It is the single source of truth for
 * "was this paid, how much, and did we deliver what was paid for".
 */
const paymentTransactionSchema = new mongoose.Schema(
    {
        /** Human-friendly id we hand to the provider as its own reference (P24 sessionId, Razorpay receipt, Stripe client_reference_id). */
        publicId: { type: String, required: true, unique: true, index: true },
        /** Random secret in the return URL so the payment-return page can poll status without a login. */
        statusToken: { type: String, required: true },
        provider: { type: String, enum: PROVIDER_IDS, required: true, index: true },
        purpose: { type: String, enum: PURPOSES, required: true, index: true },

        ownerType: { type: String, enum: ['user', 'office', 'driver', 'admin', ''], default: '' },
        ownerId: { type: mongoose.Schema.Types.ObjectId, index: true, default: null },
        /** Domain records this payment settles (subscriptionId, pantryOrderIds, tipTransactionId, ...). */
        refs: { type: mongoose.Schema.Types.Mixed, default: {} },

        amountMinor: { type: Number, required: true, min: 1 },
        currency: { type: String, required: true, uppercase: true, trim: true },
        country: { type: String, default: '' },
        description: { type: String, default: '' },
        customer: {
            name: { type: String, default: '' },
            email: { type: String, default: '' },
            phone: { type: String, default: '' }
        },
        language: { type: String, default: 'en' },

        /** Relative app paths (validated) the customer is sent to once the payment is settled. */
        returnPath: { type: String, default: '' },
        cancelPath: { type: String, default: '' },

        status: { type: String, enum: TX_STATUSES, default: 'created', index: true },
        failureReason: { type: String, default: '' },
        paidAt: { type: Date, default: null },
        expiresAt: { type: Date, default: null, index: true },

        /** Provider-side identifiers. */
        providerOrderId: { type: String, default: '', index: true },
        providerPaymentId: { type: String, default: '', index: true },
        providerData: { type: mongoose.Schema.Types.Mixed, default: {} },
        lastSyncedAt: { type: Date, default: null },

        /** Exactly-once delivery of what was paid for (activate subscription, credit wallet, ...). */
        fulfilment: {
            done: { type: Boolean, default: false },
            at: { type: Date, default: null },
            attempts: { type: Number, default: 0 },
            lockedAt: { type: Date, default: null },
            error: { type: String, default: '' }
        },
        /** Things an operator must look at, e.g. "amount_mismatch". */
        flags: { type: [String], default: [] },

        refundedMinor: { type: Number, default: 0 },
        refunds: { type: [refundSchema], default: [] },
        events: { type: [eventSchema], default: [] },
        metadata: { type: mongoose.Schema.Types.Mixed, default: {} }
    },
    { collection: 'payment_transactions', timestamps: true }
);

paymentTransactionSchema.index({ status: 1, createdAt: -1 });
paymentTransactionSchema.index({ provider: 1, providerOrderId: 1 });
paymentTransactionSchema.index({ 'fulfilment.done': 1, status: 1 });

export const newPublicId = () => `PAY-${crypto.randomBytes(6).toString('hex').toUpperCase()}`;
export const newStatusToken = () => crypto.randomBytes(24).toString('hex');

export const PaymentTransaction = mongoose.models.PaymentTransaction || mongoose.model('PaymentTransaction', paymentTransactionSchema);

/** Webhook deliveries already processed, so a replayed event does nothing twice. */
const webhookEventSchema = new mongoose.Schema(
    {
        provider: { type: String, required: true },
        eventId: { type: String, required: true },
        type: { type: String, default: '' },
        receivedAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 90 }
    },
    { collection: 'payment_webhook_events' }
);
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
export const PaymentWebhookEvent = mongoose.models.PaymentWebhookEvent || mongoose.model('PaymentWebhookEvent', webhookEventSchema);

/**
 * Admin-controlled switches. One document. Provider credentials never live here; they stay in the server environment.
 * countryRules decide which providers a customer of a given country is offered ("*" = every other country).
 */
const paymentSettingsSchema = new mongoose.Schema(
    {
        _id: { type: String, default: 'default' },
        providers: {
            razorpay: { enabled: { type: Boolean, default: true } },
            przelewy24: { enabled: { type: Boolean, default: true } },
            stripe: { enabled: { type: Boolean, default: true } }
        },
        countryRules: {
            type: [{ _id: false, country: { type: String, required: true, uppercase: true, trim: true }, providers: { type: [String], default: [] } }],
            default: () => [
                { country: 'PL', providers: ['przelewy24'] },
                { country: 'IN', providers: ['razorpay'] },
                { country: '*', providers: ['stripe'] }
            ]
        },
        /** Used when nothing tells us the customer's country (wallet top-up without a zone, etc.). */
        defaultCountry: { type: String, default: 'PL', uppercase: true },
        updatedBy: { type: String, default: '' }
    },
    { collection: 'payment_settings', timestamps: true }
);

export const PaymentSettings = mongoose.models.PaymentSettings || mongoose.model('PaymentSettings', paymentSettingsSchema);
