/**
 * Payments configuration. Everything is read lazily from the environment so tests (and hot config changes after a
 * restart) never see stale values, and secrets never leave this module except through the provider adapters.
 */
const env = () => process.env;
const trimSlash = (s) => String(s || '').replace(/\/+$/, '');

export const isProduction = () => (env().NODE_ENV || 'development') === 'production';

/**
 * "mock" lets every purchase succeed without money for local development. It is refused in production even if
 * someone sets the variable, so a misconfigured server can never hand out free subscriptions or wallet credit.
 */
export const paymentsMode = () => (String(env().PAYMENTS_MODE || 'live').toLowerCase() === 'mock' && !isProduction() ? 'mock' : 'live');

/** Where the customer's browser returns to after a hosted payment page (the web app). */
export const appPublicUrl = () => trimSlash(env().APP_PUBLIC_URL || env().FRONTEND_URL || 'http://localhost:5173');

/** Where the payment providers call us back (must be reachable from the internet for webhooks). */
export const apiPublicUrl = () => trimSlash(env().API_PUBLIC_URL || `http://localhost:${env().PORT || 5000}`);

export const p24Config = () => {
    const sandbox = String(env().P24_SANDBOX ?? 'true').toLowerCase() !== 'false';
    const merchantId = Number(env().P24_MERCHANT_ID || 0);
    return {
        merchantId,
        posId: Number(env().P24_POS_ID || merchantId || 0),
        crc: String(env().P24_CRC || ''),
        apiKey: String(env().P24_API_KEY || ''),
        sandbox,
        baseUrl: trimSlash(env().P24_BASE_URL || (sandbox ? 'https://sandbox.przelewy24.pl' : 'https://secure.przelewy24.pl'))
    };
};

export const stripeConfig = () => ({
    secretKey: String(env().STRIPE_SECRET_KEY || ''),
    webhookSecret: String(env().STRIPE_WEBHOOK_SECRET || ''),
    // Only used by tests to point the SDK at a local fake Stripe.
    apiHost: env().STRIPE_API_HOST || '',
    apiPort: env().STRIPE_API_PORT ? Number(env().STRIPE_API_PORT) : undefined,
    apiProtocol: env().STRIPE_API_PROTOCOL || ''
});

export const razorpayConfig = () => ({
    keyId: String(env().RAZORPAY_KEY_ID || ''),
    keySecret: String(env().RAZORPAY_KEY_SECRET || ''),
    webhookSecret: String(env().RAZORPAY_WEBHOOK_SECRET || '')
});

/** How long a customer has to finish paying before we stop waiting. */
export const PAYMENT_WINDOW_MINUTES = 30;
