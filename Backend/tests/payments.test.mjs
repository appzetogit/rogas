/**
 * Integration tests for the payments module (Przelewy24, Stripe, Razorpay routing, webhooks, refunds, fulfilment).
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards, and refuses to run against anything that is not localhost. The providers themselves are replaced by
 * small local fake servers that check the same signatures the real ones do, so no money or network is involved.
 *
 *   PAYMENTS_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/payments.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

const BASE_URI = process.env.PAYMENTS_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error(`Refusing to run: PAYMENTS_TEST_MONGO_URI must be a plain local mongod (got ${BASE_URI.replace(/\/\/.*@/, '//***@')})`);
}
const DB_NAME = `payments_test_${Date.now()}`;

// ─── Fake Przelewy24 ─────────────────────────────────────────────────────────
const P24 = { merchantId: 123456, crc: 'testcrckey12345', apiKey: 'test-api-key' };
const p24State = { sessions: new Map(), refunds: [], nextOrderId: 9000, failVerify: false, registerCalls: 0 };
const sha384 = (o) => crypto.createHash('sha384').update(JSON.stringify(o)).digest('hex');

const startFakeP24 = async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        const want = `Basic ${Buffer.from(`${P24.merchantId}:${P24.apiKey}`).toString('base64')}`;
        if (req.headers.authorization !== want) return res.status(401).json({ error: 'Unauthorized', code: 401 });
        next();
    });
    app.get('/api/v1/testAccess', (_req, res) => res.json({ data: true, error: '' }));
    app.post('/api/v1/transaction/register', (req, res) => {
        p24State.registerCalls++;
        const b = req.body;
        const sign = sha384({ sessionId: b.sessionId, merchantId: b.merchantId, amount: b.amount, currency: b.currency, crc: P24.crc });
        if (b.sign !== sign) return res.status(400).json({ error: 'Incorrect sign', code: 400 });
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) return res.status(400).json({ error: 'Bad email', code: 400 });
        p24State.sessions.set(b.sessionId, { ...b, orderId: ++p24State.nextOrderId, status: 0 });
        res.json({ data: { token: `TOKEN-${b.sessionId}` }, responseCode: 0 });
    });
    app.put('/api/v1/transaction/verify', (req, res) => {
        const b = req.body;
        const s = p24State.sessions.get(b.sessionId);
        const sign = sha384({ sessionId: b.sessionId, orderId: b.orderId, amount: b.amount, currency: b.currency, crc: P24.crc });
        if (!s || b.sign !== sign || s.orderId !== b.orderId || s.amount !== b.amount || p24State.failVerify) return res.status(400).json({ error: 'Verification failed', code: 400 });
        s.status = 2;
        res.json({ data: { status: 'success' }, responseCode: 0 });
    });
    app.get('/api/v1/transaction/by/sessionId/:id', (req, res) => {
        const s = p24State.sessions.get(req.params.id);
        if (!s) return res.status(404).json({ error: 'Not found', code: 404 });
        res.json({ data: { sessionId: s.sessionId, orderId: s.orderId, amount: s.amount, currency: s.currency, status: s.status } });
    });
    app.post('/api/v1/transaction/refund', (req, res) => {
        p24State.refunds.push(req.body);
        res.json({ data: req.body.refunds.map((r) => ({ orderId: r.orderId, sessionId: r.sessionId, amount: r.amount, status: true, message: 'Success' })), responseCode: 0 });
    });
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { server, url: `http://127.0.0.1:${server.address().port}` };
};

/** What Przelewy24 POSTs to urlStatus after the customer paid. */
const p24Notification = (sessionId, overrides = {}) => {
    const s = p24State.sessions.get(sessionId);
    s.status = 1;
    const n = { merchantId: P24.merchantId, posId: P24.merchantId, sessionId, amount: s.amount, originAmount: s.amount, currency: s.currency, orderId: s.orderId, methodId: 25, statement: `p24-${s.orderId}`, ...overrides };
    n.sign = overrides.sign || sha384({ merchantId: n.merchantId, posId: n.posId, sessionId: n.sessionId, amount: n.amount, originAmount: n.originAmount, currency: n.currency, orderId: n.orderId, methodId: n.methodId, statement: n.statement, crc: P24.crc });
    return n;
};

// ─── Fake Stripe ─────────────────────────────────────────────────────────────
const stripeState = { sessions: new Map(), refunds: [], n: 0, failRefund: false };
const startFakeStripe = async () => {
    const app = express();
    app.use(express.urlencoded({ extended: true }));
    app.use((req, res, next) => {
        if (!String(req.headers.authorization || '').includes('sk_test_fake')) return res.status(401).json({ error: { message: 'Invalid API key' } });
        next();
    });
    app.post('/v1/checkout/sessions', (req, res) => {
        const b = req.body;
        const item = b.line_items?.[0];
        const id = `cs_test_${++stripeState.n}`;
        const session = {
            id, object: 'checkout.session', url: `https://checkout.stripe.test/${id}`, payment_status: 'unpaid', status: 'open',
            amount_total: Number(item.price_data.unit_amount) * Number(item.quantity), currency: item.price_data.currency,
            client_reference_id: b.client_reference_id, payment_intent: null, metadata: b.metadata || {}, _request: b
        };
        stripeState.sessions.set(id, session);
        res.json(session);
    });
    app.get('/v1/checkout/sessions/:id', (req, res) => {
        const s = stripeState.sessions.get(req.params.id);
        if (!s) return res.status(404).json({ error: { message: 'No such session' } });
        res.json(s);
    });
    app.post('/v1/refunds', (req, res) => {
        if (stripeState.failRefund) return res.status(400).json({ error: { message: 'Charge already refunded' } });
        const r = { id: `re_${++stripeState.n}`, object: 'refund', status: 'succeeded', amount: Number(req.body.amount), payment_intent: req.body.payment_intent };
        stripeState.refunds.push(r);
        res.json(r);
    });
    app.get('/v1/balance', (_req, res) => res.json({ object: 'balance', livemode: false, available: [], pending: [] }));
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { server, port: server.address().port };
};

// ─── Test wiring ─────────────────────────────────────────────────────────────
let p24Server;
let stripeServer;
let webhookServer;
let webhookUrl;
let svc;
let settings;
let models;
let locale;
let stripeSdk;

const post = async (path, body, headers = {}) => {
    const res = await fetch(`${webhookUrl}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) });
    return { status: res.status, text: await res.text() };
};

const stripeEvent = (id, type, object) => {
    const payload = JSON.stringify({ id, object: 'event', type, data: { object } });
    const signature = stripeSdk.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test' });
    return { payload, signature };
};
const sendStripe = (id, type, object, signatureOverride) => {
    const { payload, signature } = stripeEvent(id, type, object);
    return post('/webhook/stripe', payload, { 'stripe-signature': signatureOverride || signature });
};

before(async () => {
    const p24 = await startFakeP24();
    p24Server = p24.server;
    const st = await startFakeStripe();
    stripeServer = st.server;

    Object.assign(process.env, {
        NODE_ENV: 'test',
        P24_MERCHANT_ID: String(P24.merchantId), P24_POS_ID: String(P24.merchantId), P24_CRC: P24.crc, P24_API_KEY: P24.apiKey,
        P24_SANDBOX: 'true', P24_BASE_URL: p24.url,
        STRIPE_SECRET_KEY: 'sk_test_fake', STRIPE_WEBHOOK_SECRET: 'whsec_test', STRIPE_API_HOST: '127.0.0.1', STRIPE_API_PORT: String(st.port), STRIPE_API_PROTOCOL: 'http',
        RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'rzp_secret_value', RAZORPAY_WEBHOOK_SECRET: 'rzp_webhook',
        API_PUBLIC_URL: 'https://api.example.test', APP_PUBLIC_URL: 'https://app.example.test',
        PAYMENTS_MODE: 'live', PAYMENTS_JOBS: 'false'
    });
    delete process.env.MONGO_URI;
    // Never let this suite's transactions (fulfil/refund/fail all now send an email) touch a real Mongo or SMTP
    // server, no matter what the developer's own .env has configured.
    delete process.env.EMAIL_HOST;
    delete process.env.EMAIL_USER;
    delete process.env.EMAIL_PASS;

    await mongoose.connect(BASE_URI, { dbName: DB_NAME });
    svc = await import('../src/modules/payments/payments.service.js');
    const emailSvc = await import('../src/modules/email/email.service.js');
    emailSvc._setTransporterForTests({ sendMail: async () => ({ messageId: 'test' }), verify: async () => true });
    settings = await import('../src/modules/payments/payments.settings.js');
    models = await import('../src/modules/payments/payments.models.js');
    locale = await import('../src/modules/payments/payments.locale.js');
    stripeSdk = new (await import('stripe')).default('sk_test_fake');
    const { providerWebhook } = await import('../src/modules/payments/payments.routes.js');

    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => { if (req.originalUrl.includes('/webhook/')) req.rawBody = buf; } }));
    app.post('/webhook/przelewy24', providerWebhook('przelewy24'));
    app.post('/webhook/stripe', providerWebhook('stripe'));
    webhookServer = http.createServer(app);
    await new Promise((r) => webhookServer.listen(0, '127.0.0.1', r));
    webhookUrl = `http://127.0.0.1:${webhookServer.address().port}`;
});

after(async () => {
    svc?.stopPaymentsJobs?.();
    for (const s of [p24Server, stripeServer, webhookServer]) await new Promise((r) => (s ? s.close(r) : r()));
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

beforeEach(async () => {
    await models.PaymentSettings.deleteMany({});
    settings.invalidateSettingsCache();
    p24State.failVerify = false;
    stripeState.failRefund = false;
    process.env.PAYMENTS_MODE = 'live';
});

const topup = (overrides = {}) =>
    svc.startPayment({
        purpose: 'wallet_topup', ownerType: 'user', ownerId: new mongoose.Types.ObjectId(), amount: 50, currency: 'PLN', country: 'PL',
        customer: { name: 'Anna', email: 'anna@example.com' }, language: 'pl', ...overrides
    });

const walletBalance = async (userId) => {
    const { FoodUserWallet } = await import('../src/modules/food/user/models/userWallet.model.js');
    const w = await FoodUserWallet.findOne({ userId }).lean();
    return { balance: w?.balance || 0, credits: (w?.transactions || []).length };
};

// ─── Locale ──────────────────────────────────────────────────────────────────

test('country and currency helpers', () => {
    assert.equal(locale.normalizeCountry('Poland'), 'PL');
    assert.equal(locale.normalizeCountry('poland'), 'PL');
    assert.equal(locale.normalizeCountry('pl'), 'PL');
    assert.equal(locale.normalizeCountry('India'), 'IN');
    assert.equal(locale.normalizeCountry('Deutschland'), 'DE');
    assert.equal(locale.normalizeCountry('UK'), 'GB');
    assert.equal(locale.normalizeCountry('Atlantis'), null);
    assert.equal(locale.countryFromDialCode('+48'), 'PL');
    assert.equal(locale.countryFromDialCode('0049'), 'DE');
    assert.equal(locale.defaultCurrencyFor('PL'), 'PLN');
    assert.equal(locale.defaultCurrencyFor('FR'), 'EUR');
    assert.equal(locale.defaultCurrencyFor('IN'), 'INR');
    assert.equal(locale.toMinor(12.34, 'PLN'), 1234);
    assert.equal(locale.toMinor(1.005, 'PLN'), 101);
    assert.equal(locale.toMinor(19.99, 'EUR'), 1999);
    assert.equal(locale.toMinor(0.1 + 0.2, 'PLN'), 30);
    assert.equal(locale.fromMinor(1234, 'PLN'), 12.34);
});

// ─── Routing and admin settings ──────────────────────────────────────────────

test('routing: Poland -> Przelewy24, other countries -> Stripe, India -> Razorpay (INR only)', async () => {
    assert.deepEqual(await settings.resolveProviders({ country: 'PL', currency: 'PLN' }), ['przelewy24']);
    assert.deepEqual(await settings.resolveProviders({ country: 'DE', currency: 'EUR' }), ['stripe']);
    assert.deepEqual(await settings.resolveProviders({ country: 'IN', currency: 'INR' }), ['razorpay']);
    // Razorpay cannot charge PLN even if an admin points a rule at it.
    assert.deepEqual(await settings.resolveProviders({ country: 'IN', currency: 'PLN' }), ['stripe']);
});

test('routing: switching a provider off falls back to the "other countries" rule; nothing usable -> empty', async () => {
    await settings.updateSettings({ providers: { przelewy24: { enabled: false } } }, 'admin');
    assert.deepEqual(await settings.resolveProviders({ country: 'PL', currency: 'PLN' }), ['stripe']);
    await settings.updateSettings({ providers: { stripe: { enabled: false } } }, 'admin');
    assert.deepEqual(await settings.resolveProviders({ country: 'PL', currency: 'PLN' }), []);
    await assert.rejects(topup(), (e) => e.code === 'NO_PROVIDER' && e.statusCode === 503);
});

test('routing: an admin can offer several providers for one country (customer chooses)', async () => {
    await settings.updateSettings({ countryRules: [{ country: 'PL', providers: ['przelewy24', 'stripe'] }, { country: 'IN', providers: ['razorpay'] }, { country: '*', providers: ['stripe'] }] }, 'admin');
    assert.deepEqual(await settings.resolveProviders({ country: 'PL', currency: 'PLN' }), ['przelewy24', 'stripe']);
    const { payment } = await topup({ provider: 'stripe' });
    assert.equal(payment.provider, 'stripe');
    await assert.rejects(topup({ provider: 'razorpay' }), (e) => e.code === 'PROVIDER_NOT_AVAILABLE');
});

test('admin settings validation', async () => {
    const before = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    await settings.updateSettings({ providers: { stripe: { enabled: false } } }, 'a');
    await assert.rejects(settings.updateSettings({ providers: { stripe: { enabled: true } } }, 'a'), /credentials are missing/);
    process.env.STRIPE_SECRET_KEY = before;

    await assert.rejects(settings.updateSettings({ countryRules: [{ country: 'PL', providers: ['razorpay'] }, { country: '*', providers: ['stripe'] }] }, 'a'), /Razorpay cannot charge PLN/);
    await assert.rejects(settings.updateSettings({ countryRules: [{ country: 'PL', providers: ['przelewy24'] }] }, 'a'), /Other countries/);
    await assert.rejects(settings.updateSettings({ countryRules: [{ country: 'PL', providers: [] }, { country: '*', providers: ['stripe'] }] }, 'a'), /at least one/);
    await assert.rejects(settings.updateSettings({ countryRules: [{ country: 'Atlantis', providers: ['stripe'] }, { country: '*', providers: ['stripe'] }] }, 'a'), /Unknown country/);
    await assert.rejects(settings.updateSettings({ countryRules: [{ country: 'PL', providers: ['bitcoin'] }, { country: '*', providers: ['stripe'] }] }, 'a'), /Unknown provider/);
    // Country names are normalised.
    const { after } = await settings.updateSettings({ countryRules: [{ country: 'Germany', providers: ['stripe'] }, { country: '*', providers: ['stripe'] }] }, 'a');
    assert.equal(after.countryRules[0].country, 'DE');
});

test('payment context: zone country, phone dial code, defaults; a stray INR city currency is ignored outside India', async () => {
    const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
    const { AdminCity } = await import('../src/modules/food/admin/models/adminCity.model.js');
    await FoodZone.collection.insertOne({ name: 'Warsaw', zoneName: 'Warsaw', country: 'Poland', isActive: true });
    const zone = await FoodZone.findOne({ name: 'Warsaw' });
    assert.deepEqual(await settings.resolvePaymentContext({ zoneId: zone._id }), { country: 'PL', currency: 'PLN' });
    assert.deepEqual(await settings.resolvePaymentContext({ dialCode: '+49' }), { country: 'DE', currency: 'EUR' });
    assert.deepEqual(await settings.resolvePaymentContext({}), { country: 'PL', currency: 'PLN' });
    await AdminCity.collection.insertOne({ name: 'Berlin', country: 'Germany', currency: 'INR' });
    settings.invalidateCityCache();
    assert.equal((await settings.resolvePaymentContext({ country: 'DE' })).currency, 'EUR');
    await AdminCity.collection.insertOne({ name: 'Prague', country: 'Czechia', currency: 'CZK' });
    settings.invalidateCityCache();
    assert.equal((await settings.resolvePaymentContext({ country: 'CZ' })).currency, 'CZK');
});

// ─── Przelewy24 ──────────────────────────────────────────────────────────────

test('P24: payment is registered with a valid signature and the customer is sent to the P24 page', async () => {
    const { payment, transaction } = await topup();
    assert.equal(payment.provider, 'przelewy24');
    assert.equal(payment.status, 'pending');
    assert.equal(payment.action.type, 'redirect');
    assert.match(payment.action.url, /\/trnRequest\/TOKEN-PAY-/);
    const registered = p24State.sessions.get(transaction.publicId);
    assert.equal(registered.amount, 5000);
    assert.equal(registered.currency, 'PLN');
    assert.equal(registered.language, 'pl');
    assert.equal(registered.country, 'PL');
    assert.match(registered.urlStatus, /^https:\/\/api\.example\.test\/api\/v1\/payments\/webhook\/przelewy24$/);
    assert.match(registered.urlReturn, new RegExp(`^https://app\\.example\\.test/payment/return\\?tx=${transaction.publicId}&t=`));
});

test('P24: missing customer email falls back to a valid address; unsupported language falls back to English', async () => {
    const { transaction } = await topup({ customer: { name: 'No Email' }, language: 'uk' });
    const s = p24State.sessions.get(transaction.publicId);
    assert.match(s.email, /@/);
    assert.equal(s.language, 'en');
});

test('P24: a signed notification confirms the payment with P24, then delivers the wallet credit once', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId, amount: 75.5 });
    const res = await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    assert.equal(res.status, 200);

    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.status, 'paid');
    assert.equal(tx.fulfilment.done, true);
    assert.equal(tx.providerPaymentId, String(p24State.sessions.get(transaction.publicId).orderId));
    assert.equal(p24State.sessions.get(transaction.publicId).status, 2, 'transaction/verify was called');
    assert.deepEqual(await walletBalance(ownerId), { balance: 75.5, credits: 1 });
});

test('P24: replayed and concurrent notifications never double-credit', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId, amount: 20 });
    const n = p24Notification(transaction.publicId);
    const results = await Promise.all(Array.from({ length: 6 }, () => post('/webhook/przelewy24', n)));
    assert.ok(results.every((r) => r.status === 200));
    await post('/webhook/przelewy24', n);
    assert.deepEqual(await walletBalance(ownerId), { balance: 20, credits: 1 });
});

test('P24: a forged or tampered notification is rejected and changes nothing', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId, amount: 20 });
    const forged = p24Notification(transaction.publicId, { sign: 'f'.repeat(96) });
    assert.equal((await post('/webhook/przelewy24', forged)).status, 400);
    const tampered = { ...p24Notification(transaction.publicId), amount: 1 };
    assert.equal((await post('/webhook/przelewy24', tampered)).status, 400);
    assert.equal((await post('/webhook/przelewy24', 'not json')).status, 400);
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.status, 'pending');
    assert.deepEqual(await walletBalance(ownerId), { balance: 0, credits: 0 });
});

test('P24: a correctly signed notification for a DIFFERENT amount is flagged, never settled', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId, amount: 100 });
    const cheap = p24Notification(transaction.publicId, { amount: 100, originAmount: 100 }); // 1.00 PLN instead of 100.00
    assert.equal((await post('/webhook/przelewy24', cheap)).status, 200);
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.status, 'pending');
    assert.ok(tx.flags.includes('amount_mismatch'));
    assert.deepEqual(await walletBalance(ownerId), { balance: 0, credits: 0 });
});

test('P24: if P24 refuses the verification the payment stays open (and the provider is retried later)', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId });
    p24State.failVerify = true;
    const res = await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    assert.equal(res.status, 500, 'answer 500 so P24 retries the notification');
    assert.equal((await models.PaymentTransaction.findOne({ publicId: transaction.publicId })).status, 'pending');
    p24State.failVerify = false;
    assert.equal((await post('/webhook/przelewy24', p24Notification(transaction.publicId))).status, 200);
    assert.equal((await models.PaymentTransaction.findOne({ publicId: transaction.publicId })).status, 'paid');
});

test('return page: polling settles a paid P24 payment even when the webhook never arrived; wrong token is refused', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId, amount: 30 });
    assert.equal((await svc.getPublicStatus(transaction.publicId, transaction.statusToken)).status, 'pending');
    await assert.rejects(svc.getPublicStatus(transaction.publicId, 'wrong'), (e) => e.statusCode === 404);
    await assert.rejects(svc.getPublicStatus('PAY-NOPE', transaction.statusToken), (e) => e.statusCode === 404);

    p24State.sessions.get(transaction.publicId).status = 1; // customer paid; P24's notification is lost
    await models.PaymentTransaction.updateOne({ _id: transaction._id }, { $set: { lastSyncedAt: new Date(0) } });
    const status = await svc.getPublicStatus(transaction.publicId, transaction.statusToken);
    assert.equal(status.status, 'paid');
    assert.equal(status.fulfilled, true);
    assert.equal(status.returnPath, '');
    assert.deepEqual(await walletBalance(ownerId), { balance: 30, credits: 1 });
});

test('reconciler: settles a lost webhook, expires an abandoned payment, and leaves fresh ones alone', async () => {
    const paid = await topup({ amount: 11 });
    const abandoned = await topup({ amount: 12 });
    const fresh = await topup({ amount: 13 });
    p24State.sessions.get(paid.transaction.publicId).status = 1;

    const old = new Date(Date.now() - 2 * 60_000);
    await models.PaymentTransaction.collection.updateMany({ publicId: { $in: [paid.transaction.publicId, abandoned.transaction.publicId] } }, { $set: { createdAt: old } });
    await models.PaymentTransaction.collection.updateOne({ publicId: abandoned.transaction.publicId }, { $set: { expiresAt: new Date(Date.now() - 10 * 60_000) } });

    await svc.reconcilePending();
    const get = (p) => models.PaymentTransaction.findOne({ publicId: p.transaction.publicId });
    assert.equal((await get(paid)).status, 'paid');
    assert.equal((await get(abandoned)).status, 'expired');
    assert.equal((await get(fresh)).status, 'pending');
});

// ─── Stripe ──────────────────────────────────────────────────────────────────

const stripeTopup = (overrides = {}) => topup({ provider: 'stripe', country: 'DE', currency: 'EUR', language: 'de', ...overrides });
const sessionOf = (tx) => stripeState.sessions.get(tx.providerOrderId);

test('Stripe: creates a Checkout Session with the right amount, currency, reference and return URLs', async () => {
    const { payment, transaction } = await stripeTopup({ amount: 19.99 });
    assert.equal(payment.provider, 'stripe');
    assert.equal(payment.action.type, 'redirect');
    assert.match(payment.action.url, /^https:\/\/checkout\.stripe\.test\/cs_test_/);
    const s = sessionOf(transaction);
    assert.equal(s.amount_total, 1999);
    assert.equal(s.currency, 'eur');
    assert.equal(s.client_reference_id, transaction.publicId);
    assert.equal(s._request.locale, 'de');
    assert.equal(s._request.mode, 'payment');
    assert.match(s._request.success_url, /^https:\/\/app\.example\.test\/payment\/return\?tx=PAY-/);
    assert.match(s._request.cancel_url, /cancelled=1$/);
});

test('Stripe: checkout.session.completed with a valid signature settles and delivers once (replay ignored)', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await stripeTopup({ ownerId, amount: 40 });
    const s = sessionOf(transaction);
    const obj = { ...s, payment_status: 'paid', status: 'complete', payment_intent: 'pi_123' };
    assert.equal((await sendStripe('evt_1', 'checkout.session.completed', obj)).status, 200);
    assert.equal((await sendStripe('evt_1', 'checkout.session.completed', obj)).status, 200);
    assert.equal((await sendStripe('evt_2', 'checkout.session.completed', obj)).status, 200); // a different event for an already-paid session
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.status, 'paid');
    assert.equal(tx.providerPaymentId, 'pi_123');
    assert.deepEqual(await walletBalance(ownerId), { balance: 40, credits: 1 });
    assert.equal(await models.PaymentWebhookEvent.countDocuments({ provider: 'stripe', eventId: 'evt_1' }), 1);
});

test('Stripe: bad or missing signature is rejected', async () => {
    const { transaction } = await stripeTopup();
    const obj = { ...sessionOf(transaction), payment_status: 'paid' };
    assert.equal((await sendStripe('evt_bad', 'checkout.session.completed', obj, 't=1,v1=deadbeef')).status, 400);
    assert.equal((await post('/webhook/stripe', { id: 'evt_x', type: 'checkout.session.completed', data: { object: obj } })).status, 400);
    assert.equal((await models.PaymentTransaction.findOne({ publicId: transaction.publicId })).status, 'pending');
});

test('Stripe: wrong amount or currency in the event is flagged, never settled', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await stripeTopup({ ownerId, amount: 40 });
    const obj = { ...sessionOf(transaction), payment_status: 'paid', amount_total: 100, payment_intent: 'pi_cheap' };
    await sendStripe('evt_cheap', 'checkout.session.completed', obj);
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.status, 'pending');
    assert.ok(tx.flags.includes('amount_mismatch'));
    assert.deepEqual(await walletBalance(ownerId), { balance: 0, credits: 0 });
});

test('Stripe: delayed payment methods (P24/BLIK inside Stripe) settle on async_payment_succeeded, and can fail or expire', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const a = await stripeTopup({ ownerId, amount: 25 });
    const unpaid = { ...sessionOf(a.transaction), payment_status: 'unpaid', status: 'complete' };
    await sendStripe('evt_a1', 'checkout.session.completed', unpaid);
    assert.equal((await models.PaymentTransaction.findOne({ publicId: a.transaction.publicId })).status, 'pending');
    await sendStripe('evt_a2', 'checkout.session.async_payment_succeeded', { ...unpaid, payment_status: 'paid', payment_intent: 'pi_async' });
    assert.equal((await models.PaymentTransaction.findOne({ publicId: a.transaction.publicId })).status, 'paid');
    assert.deepEqual(await walletBalance(ownerId), { balance: 25, credits: 1 });

    const b = await stripeTopup();
    await sendStripe('evt_b1', 'checkout.session.async_payment_failed', sessionOf(b.transaction));
    assert.equal((await models.PaymentTransaction.findOne({ publicId: b.transaction.publicId })).status, 'failed');

    const c = await stripeTopup();
    await sendStripe('evt_c1', 'checkout.session.expired', sessionOf(c.transaction));
    assert.equal((await models.PaymentTransaction.findOne({ publicId: c.transaction.publicId })).status, 'expired');
});

test('Stripe: a late successful payment after the session was marked failed/expired still settles', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await stripeTopup({ ownerId, amount: 15 });
    await sendStripe('evt_l1', 'checkout.session.expired', sessionOf(transaction));
    await sendStripe('evt_l2', 'checkout.session.completed', { ...sessionOf(transaction), payment_status: 'paid', payment_intent: 'pi_late' });
    assert.equal((await models.PaymentTransaction.findOne({ publicId: transaction.publicId })).status, 'paid');
    assert.deepEqual(await walletBalance(ownerId), { balance: 15, credits: 1 });
});

test('Stripe: the return page settles from Stripe when the webhook is late', async () => {
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await stripeTopup({ ownerId, amount: 9 });
    const s = sessionOf(transaction);
    s.payment_status = 'paid';
    s.status = 'complete';
    s.payment_intent = 'pi_poll';
    const status = await svc.getPublicStatus(transaction.publicId, transaction.statusToken);
    assert.equal(status.status, 'paid');
    assert.deepEqual(await walletBalance(ownerId), { balance: 9, credits: 1 });
});

// ─── Razorpay ────────────────────────────────────────────────────────────────

const rzpSignature = (orderId, paymentId) => crypto.createHmac('sha256', 'rzp_secret_value').update(`${orderId}|${paymentId}`).digest('hex');
let rzpProvider;
const stubRazorpay = async (paymentByOrder) => {
    rzpProvider = await import('../src/modules/payments/providers/razorpay.provider.js');
    rzpProvider._setRazorpayClientForTests(() => ({
        orders: { create: async (o) => ({ id: `order_${o.receipt}`, amount: o.amount, currency: o.currency }), fetchPayments: async (id) => ({ items: paymentByOrder[id] ? [paymentByOrder[id]] : [] }) },
        payments: { fetch: async (id) => Object.values(paymentByOrder).find((p) => p.id === id), refund: async () => ({ id: 'rfnd_1', status: 'processed' }) }
    }));
};
const inrTopup = (overrides = {}) => topup({ provider: 'razorpay', country: 'IN', currency: 'INR', amount: 500, language: 'en', ...overrides });

test('Razorpay: pop-up result with a valid signature settles; bad signature or foreign order is rejected', async () => {
    const paymentByOrder = {};
    await stubRazorpay(paymentByOrder);
    const ownerId = new mongoose.Types.ObjectId();
    const { payment, transaction } = await inrTopup({ ownerId });
    assert.equal(payment.action.type, 'razorpay');
    assert.equal(payment.action.amount, 50000);
    assert.equal(payment.action.currency, 'INR');
    const orderId = payment.action.orderId;

    await assert.rejects(svc.confirmRazorpayPayment(transaction, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: 'nope' }), /invalid signature/);
    await assert.rejects(svc.confirmRazorpayPayment(transaction, { razorpay_order_id: 'order_other', razorpay_payment_id: 'pay_1', razorpay_signature: rzpSignature('order_other', 'pay_1') }), /does not belong/);
    assert.equal((await models.PaymentTransaction.findById(transaction._id)).status, 'pending');

    // The signed payment exists at Razorpay but is for a smaller amount: refused.
    paymentByOrder[orderId] = { id: 'pay_1', order_id: orderId, amount: 100, currency: 'INR', status: 'captured' };
    await svc.confirmRazorpayPayment(transaction, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_1', razorpay_signature: rzpSignature(orderId, 'pay_1') });
    assert.ok((await models.PaymentTransaction.findById(transaction._id)).flags.includes('amount_mismatch'));
    assert.deepEqual(await walletBalance(ownerId), { balance: 0, credits: 0 });

    paymentByOrder[orderId] = { id: 'pay_2', order_id: orderId, amount: 50000, currency: 'INR', status: 'captured' };
    const after = await svc.confirmRazorpayPayment(transaction, { razorpay_order_id: orderId, razorpay_payment_id: 'pay_2', razorpay_signature: rzpSignature(orderId, 'pay_2') });
    assert.equal(after.status, 'paid');
    assert.deepEqual(await walletBalance(ownerId), { balance: 500, credits: 1 });
});

test('Razorpay: the webhook settles a payment whose browser confirmation never arrived', async () => {
    await stubRazorpay({});
    const ownerId = new mongoose.Types.ObjectId();
    const { payment } = await inrTopup({ ownerId, amount: 200 });
    await svc.handleRazorpayEvents({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w', order_id: payment.action.orderId, amount: 20000, currency: 'INR' } } } });
    await svc.handleRazorpayEvents({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_w', order_id: payment.action.orderId, amount: 20000, currency: 'INR' } } } });
    assert.deepEqual(await walletBalance(ownerId), { balance: 200, credits: 1 });
});

test('Razorpay: a failed attempt does not fail the payment (the customer can retry in the pop-up)', async () => {
    await stubRazorpay({});
    const { payment, transaction } = await inrTopup();
    await svc.handleRazorpayEvents({ event: 'payment.failed', payload: { payment: { entity: { id: 'pay_f', order_id: payment.action.orderId, error_description: 'card declined' } } } });
    assert.equal((await models.PaymentTransaction.findById(transaction._id)).status, 'pending');
});

test('Razorpay: refuses to start for a non-INR payment', async () => {
    await stubRazorpay({});
    await assert.rejects(topup({ provider: 'razorpay' }), (e) => e.code === 'PROVIDER_NOT_AVAILABLE');
});

// ─── Delivering what was paid for ────────────────────────────────────────────

test('driver deposit is recorded only after the money arrives, once', async () => {
    const driverId = new mongoose.Types.ObjectId();
    const { FoodDeliveryCashDeposit } = await import('../src/modules/food/delivery/models/foodDeliveryCashDeposit.model.js');
    const { transaction } = await svc.startPayment({ purpose: 'driver_deposit', ownerType: 'driver', ownerId: driverId, amount: 120, currency: 'PLN', country: 'PL', customer: { email: 'd@example.com' } });
    assert.equal(await FoodDeliveryCashDeposit.countDocuments({ deliveryPartnerId: driverId }), 0);
    await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    const deposits = await FoodDeliveryCashDeposit.find({ deliveryPartnerId: driverId }).lean();
    assert.equal(deposits.length, 1);
    assert.equal(deposits[0].amount, 120);
    assert.equal(deposits[0].status, 'Completed');
    assert.equal(deposits[0].paymentMethod, 'przelewy24');
    assert.equal(deposits[0].paymentTransactionId, transaction.publicId);
});

test('pantry orders: one payment settles every group; failure cancels the unpaid orders', async () => {
    const { PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js');
    const mk = (orderId) => ({ orderId, userId: new mongoose.Types.ObjectId(), vendorId: new mongoose.Types.ObjectId(), status: 'pending_payment', paymentStatus: 'pending' });
    await PantryOrder.collection.insertMany([mk('PO-AAAAAA'), mk('PO-BBBBBB'), mk('PO-CCCCCC')]);

    const ok = await svc.startPayment({ purpose: 'pantry', ownerType: 'user', ownerId: new mongoose.Types.ObjectId(), amount: 99, currency: 'PLN', country: 'PL', customer: { email: 'p@example.com' }, refs: { orderIds: ['PO-AAAAAA', 'PO-BBBBBB'] } });
    await post('/webhook/przelewy24', p24Notification(ok.transaction.publicId));
    const paid = await PantryOrder.find({ orderId: { $in: ['PO-AAAAAA', 'PO-BBBBBB'] } }).lean();
    assert.ok(paid.every((o) => o.status === 'paid' && o.paymentStatus === 'completed'));
    assert.equal((await PantryOrder.findOne({ orderId: 'PO-CCCCCC' }).lean()).status, 'pending_payment');

    const bad = await svc.startPayment({ purpose: 'pantry', ownerType: 'user', ownerId: new mongoose.Types.ObjectId(), amount: 10, currency: 'PLN', country: 'PL', customer: { email: 'p@example.com' }, refs: { orderIds: ['PO-CCCCCC'] } });
    await svc.applyProviderResult(bad.transaction._id, { state: 'expired' }, 'test');
    assert.equal((await PantryOrder.findOne({ orderId: 'PO-CCCCCC' }).lean()).status, 'cancelled');
});

test('tip: credited to the order exactly once', async () => {
    const { FoodDeliveryTipTransaction, DMBDailyOrder } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js');
    const orderId = new mongoose.Types.ObjectId();
    await DMBDailyOrder.collection.insertOne({ _id: orderId, driverTip: 0 });
    const tip = await FoodDeliveryTipTransaction.collection.insertOne({ deliveryPartnerId: new mongoose.Types.ObjectId(), orderId, amount: 7, razorpayOrderId: `pending_${Date.now()}`, status: 'pending' });
    const { transaction } = await svc.startPayment({ purpose: 'tip', ownerType: 'user', ownerId: new mongoose.Types.ObjectId(), amount: 7, currency: 'PLN', country: 'PL', customer: { email: 't@example.com' }, refs: { tipTransactionId: String(tip.insertedId), orderId: String(orderId) } });
    await Promise.all([post('/webhook/przelewy24', p24Notification(transaction.publicId)), post('/webhook/przelewy24', p24Notification(transaction.publicId))]);
    assert.equal((await DMBDailyOrder.collection.findOne({ _id: orderId })).driverTip, 7);
    assert.equal((await FoodDeliveryTipTransaction.collection.findOne({ _id: tip.insertedId })).status, 'completed');
});

test('subscription: activated by the payment; a subscription that can no longer be honoured is flagged, not lost', async () => {
    const { DMBSubscription } = await import('../src/modules/dailymealbox/subscription/subscription.model.js');
    const userId = new mongoose.Types.ObjectId();
    const base = { userId, vendorId: new mongoose.Types.ObjectId(), startDate: new Date(), endDate: new Date() };
    await DMBSubscription.collection.insertMany([{ ...base, subscriptionId: 'SUB-OK', status: 'pending_payment' }, { ...base, subscriptionId: 'SUB-GONE', status: 'cancelled' }]);
    const a = await svc.startPayment({ purpose: 'subscription', ownerType: 'user', ownerId: userId, amount: 200, currency: 'PLN', country: 'PL', customer: { email: 's@example.com' }, refs: { subscriptionId: 'SUB-OK' } });
    await post('/webhook/przelewy24', p24Notification(a.transaction.publicId));
    assert.equal((await DMBSubscription.collection.findOne({ subscriptionId: 'SUB-OK' })).status, 'active');

    const b = await svc.startPayment({ purpose: 'subscription', ownerType: 'user', ownerId: userId, amount: 200, currency: 'PLN', country: 'PL', customer: { email: 's@example.com' }, refs: { subscriptionId: 'SUB-GONE' } });
    await post('/webhook/przelewy24', p24Notification(b.transaction.publicId));
    const tx = await models.PaymentTransaction.findOne({ publicId: b.transaction.publicId });
    assert.equal(tx.status, 'paid');
    assert.ok(tx.flags.includes('needs_attention'));
    assert.equal(tx.fulfilment.done, true);
    assert.equal((await DMBSubscription.collection.findOne({ subscriptionId: 'SUB-GONE' })).status, 'cancelled', 'not silently reactivated');
});

test('a failing delivery is retried later and the customer is not charged twice for it', async () => {
    const { transaction } = await svc.startPayment({ purpose: 'office', ownerType: 'office', ownerId: new mongoose.Types.ObjectId(), amount: 300, currency: 'PLN', country: 'PL', customer: { email: 'o@example.com' }, refs: { officePaymentId: String(new mongoose.Types.ObjectId()) } });
    await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    let tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.status, 'paid', 'money is recorded even though delivery failed');
    assert.equal(tx.fulfilment.done, false);
    assert.match(tx.fulfilment.error, /not found/i);
    assert.ok(tx.fulfilment.attempts >= 1);

    // Make the delivery possible, then let the background job pick it up.
    const { OfficePayment } = await import('../src/modules/dailymealbox/office/models/officePayment.model.js');
    const { OfficeAssignError } = await import('../src/modules/dailymealbox/office/office.assignment.service.js');
    assert.ok(OfficeAssignError);
    const op = await OfficePayment.collection.insertOne({ accountId: new mongoose.Types.ObjectId(), razorpayOrderId: 'x', amount: 300, status: 'pending', fulfilledAt: new Date(), employeeIds: [] });
    await models.PaymentTransaction.collection.updateOne({ publicId: transaction.publicId }, { $set: { 'refs.officePaymentId': String(op.insertedId), paidAt: new Date(Date.now() - 60_000) } });
    const result = await svc.retryUnfulfilled();
    assert.equal(result.delivered, 1);
    tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.fulfilment.done, true);
});

// ─── Refunds ─────────────────────────────────────────────────────────────────

const paidP24 = async (overrides = {}) => {
    const { transaction } = await svc.startPayment({ purpose: 'subscription', ownerType: 'user', ownerId: new mongoose.Types.ObjectId(), amount: 100, currency: 'PLN', country: 'PL', customer: { email: 'r@example.com' }, refs: { subscriptionId: `SUB-${Math.random()}` }, ...overrides });
    await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    return models.PaymentTransaction.findOne({ publicId: transaction.publicId });
};

test('P24 refunds: partial then remainder, never more than was paid, subscription/purpose rules enforced', async () => {
    const tx = await paidP24();
    const partial = await svc.refundTransaction(tx.publicId, { amount: 30, reason: 'complaint', actor: 'admin1' });
    assert.equal(partial.status, 'partially_refunded');
    assert.equal(partial.refundedMinor, 3000);
    assert.equal(p24State.refunds.at(-1).refunds[0].amount, 3000);
    assert.equal(p24State.refunds.at(-1).refunds[0].orderId, Number(tx.providerPaymentId));

    await assert.rejects(svc.refundTransaction(tx.publicId, { amount: 80 }), (e) => e.code === 'INVALID_AMOUNT');
    const full = await svc.refundTransaction(tx.publicId, { reason: 'rest' });
    assert.equal(full.status, 'refunded');
    assert.equal(full.refundedMinor, 10000);
    await assert.rejects(svc.refundTransaction(tx.publicId, { amount: 1 }), (e) => e.code === 'INVALID_AMOUNT');
});

test('refunds: only paid payments; wallet top-ups are not refundable to the card', async () => {
    const { transaction } = await topup();
    await assert.rejects(svc.refundTransaction(transaction.publicId, {}), (e) => e.code === 'NOT_REFUNDABLE');
    const w = await topup();
    await post('/webhook/przelewy24', p24Notification(w.transaction.publicId));
    await assert.rejects(svc.refundTransaction(w.transaction.publicId, {}), /Wallet top-ups/);
});

test('refunds: two admins refunding at once cannot exceed the paid amount', async () => {
    const tx = await paidP24();
    const results = await Promise.allSettled([svc.refundTransaction(tx.publicId, { amount: 70 }), svc.refundTransaction(tx.publicId, { amount: 70 })]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal((await models.PaymentTransaction.findOne({ publicId: tx.publicId })).refundedMinor, 7000);
});

test('Stripe refunds go to the PaymentIntent; a provider failure leaves no phantom refund', async () => {
    const { transaction } = await stripeTopup({ purpose: 'subscription', refs: { subscriptionId: 'SUB-S' }, amount: 60 });
    await sendStripe('evt_r1', 'checkout.session.completed', { ...sessionOf(transaction), payment_status: 'paid', payment_intent: 'pi_refund' });
    const done = await svc.refundTransaction(transaction.publicId, { amount: 10 });
    assert.equal(done.refundedMinor, 1000);
    assert.equal(stripeState.refunds.at(-1).payment_intent, 'pi_refund');
    assert.equal(stripeState.refunds.at(-1).amount, 1000);

    stripeState.failRefund = true;
    await assert.rejects(svc.refundTransaction(transaction.publicId, { amount: 10 }), (e) => e.code === 'REFUND_FAILED');
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.refundedMinor, 1000);
    assert.equal(tx.refunds.at(-1).status, 'failed');

    // A refund made in the Stripe dashboard is picked up from charge.refunded.
    stripeState.failRefund = false;
    await sendStripe('evt_r2', 'charge.refunded', { id: 'ch_1', payment_intent: 'pi_refund', amount_refunded: 6000 });
    const synced = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(synced.status, 'refunded');
    assert.equal(synced.refundedMinor, 6000);
});

// ─── Emails: paid / failed / refunded, every purpose, no customer email = no crash ────────────

test('a fulfilled payment emails the customer a receipt', async () => {
    const { EmailLog } = await import('../src/modules/email/email.models.js');
    const { transaction } = await topup({ ownerId: new mongoose.Types.ObjectId() });
    await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.fulfilment.done, true);

    const log = await EmailLog.findOne({ to: 'anna@example.com', templateKey: 'Payment received' }).sort({ createdAt: -1 });
    assert.ok(log, 'a receipt email was queued');
    assert.equal(log.language, 'pl');
    assert.match(log.html, /50/); // the PLN 50 amount, somewhere in the body
});

test('a transaction with no customer email never throws trying to send one', async () => {
    const { transaction } = await topup({ customer: {} });
    await post('/webhook/przelewy24', p24Notification(transaction.publicId));
    const tx = await models.PaymentTransaction.findOne({ publicId: transaction.publicId });
    assert.equal(tx.fulfilment.done, true, 'fulfilment still completes with no email address on file');
});

test('a failed payment emails the customer, and CCs the admin support inbox when one is configured', async () => {
    const { EmailLog } = await import('../src/modules/email/email.models.js');
    const { FoodBusinessSettings } = await import('../src/modules/food/admin/models/businessSettings.model.js');
    await FoodBusinessSettings.deleteMany({});
    await FoodBusinessSettings.create({ supportEmail: 'ops@example.test' });

    const { transaction } = await topup();
    await svc.applyProviderResult(transaction._id, { state: 'failed', reason: 'Card declined' }, 'test');

    const customerLog = await EmailLog.findOne({ to: 'anna@example.com', templateKey: 'Payment failed' }).sort({ createdAt: -1 });
    assert.ok(customerLog, 'the customer is told their payment failed');
    assert.match(customerLog.html, /Card declined/);

    const adminLog = await EmailLog.findOne({ to: 'ops@example.test', templateKey: 'Payment failed' }).sort({ createdAt: -1 });
    assert.ok(adminLog, 'the admin support inbox is told too');
    assert.match(adminLog.html, /anna@example\.com/);

    // An expired (abandoned) checkout is not a failure the customer or admin needs an email about.
    const before = await EmailLog.countDocuments({ templateKey: 'Payment failed' });
    const { transaction: abandoned } = await topup();
    await svc.applyProviderResult(abandoned._id, { state: 'expired' }, 'test');
    assert.equal(await EmailLog.countDocuments({ templateKey: 'Payment failed' }), before, 'expiry sends no "Payment failed" email');
});

test('a refund emails the customer and the admin support inbox', async () => {
    const { EmailLog } = await import('../src/modules/email/email.models.js');
    const { FoodBusinessSettings } = await import('../src/modules/food/admin/models/businessSettings.model.js');
    await FoodBusinessSettings.deleteMany({});
    await FoodBusinessSettings.create({ supportEmail: 'ops2@example.test' });

    const tx = await paidP24({ customer: { email: 'refund-recipient@example.com' }, amount: 40 });
    await svc.refundTransaction(tx.publicId, { amount: 15, reason: 'Order not delivered' });

    const customerLog = await EmailLog.findOne({ to: 'refund-recipient@example.com', templateKey: 'Refund issued' });
    assert.ok(customerLog, 'the customer is emailed about the refund');
    assert.match(customerLog.html, /15\.00/);

    const adminLog = await EmailLog.findOne({ to: 'ops2@example.test', templateKey: 'Refund issued' });
    assert.ok(adminLog, 'the admin support inbox is told too');
    assert.match(adminLog.html, /Order not delivered/);
});

// ─── Safety rails ────────────────────────────────────────────────────────────

test('return paths must be same-site relative paths', async () => {
    assert.equal(svc.sanitizePath('/user/orders'), '/user/orders');
    assert.equal(svc.sanitizePath('//evil.example/x'), '');
    assert.equal(svc.sanitizePath('https://evil.example'), '');
    assert.equal(svc.sanitizePath('/\\evil'), '');
    assert.equal(svc.sanitizePath('javascript:alert(1)'), '');
    const { transaction } = await topup({ returnPath: 'https://evil.example', cancelPath: '/user/plans' });
    assert.equal(transaction.returnPath, '');
    assert.equal(transaction.cancelPath, '/user/plans');
});

test('mock payments exist only when PAYMENTS_MODE=mock, and never in production', async () => {
    assert.ok(!(await settings.resolveProviders({ country: 'PL', currency: 'PLN' })).includes('mock'));
    process.env.PAYMENTS_MODE = 'mock';
    assert.deepEqual(await settings.resolveProviders({ country: 'PL', currency: 'PLN' }), ['przelewy24', 'mock']);
    const ownerId = new mongoose.Types.ObjectId();
    const { transaction } = await topup({ ownerId, provider: 'mock', amount: 5 });
    await svc.confirmMockPayment(transaction);
    assert.deepEqual(await walletBalance(ownerId), { balance: 5, credits: 1 });

    process.env.NODE_ENV = 'production';
    try {
        assert.ok(!(await settings.resolveProviders({ country: 'PL', currency: 'PLN' })).includes('mock'), 'mock is refused in production');
    } finally {
        process.env.NODE_ENV = 'test';
    }
});

test('invalid amounts are refused before anything is created', async () => {
    for (const amount of [0, -5, NaN, 'abc']) await assert.rejects(topup({ amount }), (e) => e.code === 'INVALID_AMOUNT');
    assert.equal(await models.PaymentTransaction.countDocuments({ status: 'created' }), 0, 'nothing is left half-created');
});

test('provider outage while starting a payment surfaces a friendly error and records the failure', async () => {
    const saved = process.env.P24_BASE_URL;
    process.env.P24_BASE_URL = 'http://127.0.0.1:9'; // nothing listens here
    try {
        await assert.rejects(topup(), (e) => e.code === 'PROVIDER_ERROR' && !/127\.0\.0\.1/.test(e.message));
        const failed = await models.PaymentTransaction.findOne({ status: 'failed' }).sort({ createdAt: -1 });
        assert.match(failed.failureReason, /unreachable|timed out/i);
    } finally {
        process.env.P24_BASE_URL = saved;
    }
});

test('provider connection tests', async () => {
    const { getProvider } = await import('../src/modules/payments/providers/index.js');
    assert.equal((await getProvider('przelewy24').testConnection()).ok, true);
    assert.equal((await getProvider('stripe').testConnection()).ok, true);
    const saved = process.env.P24_API_KEY;
    process.env.P24_API_KEY = 'wrong';
    try {
        assert.equal((await getProvider('przelewy24').testConnection()).ok, false);
    } finally {
        process.env.P24_API_KEY = saved;
    }
});

// ─── HTTP API ────────────────────────────────────────────────────────────────

const serve = async (mount) => {
    const app = express();
    app.use(express.json());
    mount(app);
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    return { server, url: `http://127.0.0.1:${server.address().port}` };
};

test('HTTP: /methods tells the checkout which providers to offer; /status is protected by the return token', async () => {
    const { paymentsRouter } = await import('../src/modules/payments/payments.routes.js');
    const { server, url } = await serve((app) => app.use('/payments', paymentsRouter));
    try {
        const pl = await (await fetch(`${url}/payments/methods?country=Poland`)).json();
        assert.deepEqual([pl.country, pl.currency, pl.providers.map((p) => p.id)], ['PL', 'PLN', ['przelewy24']]);
        const de = await (await fetch(`${url}/payments/methods?dialCode=%2B49`)).json();
        assert.deepEqual([de.country, de.currency, de.providers.map((p) => p.id)], ['DE', 'EUR', ['stripe']]);
        assert.equal(de.providers[0].label, 'Stripe');
        assert.equal(pl.mock, false);

        const { transaction } = await topup({ returnPath: '/user/wallet' });
        const ok = await (await fetch(`${url}/payments/${transaction.publicId}/status?t=${transaction.statusToken}`)).json();
        assert.deepEqual([ok.success, ok.status, ok.returnPath, ok.currency, ok.amount], [true, 'pending', '/user/wallet', 'PLN', 50]);
        assert.equal(JSON.stringify(ok).includes(transaction.statusToken), false, 'the token is never echoed back');
        assert.equal((await fetch(`${url}/payments/${transaction.publicId}/status?t=nope`)).status, 404);
        assert.equal((await fetch(`${url}/payments/${transaction.publicId}/status`)).status, 404);
    } finally {
        await new Promise((r) => server.close(r));
    }
});

test('HTTP admin API: overview, audited settings, provider test, transaction list / recheck / refund', async () => {
    const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
    const { adminPaymentsRouter } = await import('../src/modules/payments/payments.admin.routes.js');
    const admin = await FoodAdmin.collection.insertOne({ name: 'Root', email: 'root-pay@example.com', adminRole: 'SUPER_ADMIN', isActive: true });
    const { server, url } = await serve((app) => {
        app.use((req, _res, next) => { req.user = { userId: String(admin.insertedId), _id: String(admin.insertedId), role: 'ADMIN' }; next(); });
        app.use('/admin/payments', adminPaymentsRouter);
    });
    const call = async (method, p, body) => {
        const res = await fetch(`${url}/admin/payments${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };
    try {
        const overview = await call('GET', '/');
        assert.equal(overview.status, 200);
        const byId = Object.fromEntries(overview.body.data.providers.map((p) => [p.id, p]));
        assert.deepEqual(Object.keys(byId).sort(), ['przelewy24', 'razorpay', 'stripe']);
        assert.equal(byId.przelewy24.configured, true);
        assert.equal(byId.przelewy24.mode, 'sandbox');
        assert.equal(byId.stripe.mode, 'test');
        assert.equal(JSON.stringify(overview.body).includes('rzp_secret_value'), false, 'no secret ever leaves the server');
        assert.equal(JSON.stringify(overview.body).includes('sk_test_fake'), false);
        assert.match(overview.body.data.urls.webhooks.przelewy24, /\/api\/v1\/payments\/webhook\/przelewy24$/);
        assert.ok(overview.body.data.warnings.some((w) => /SANDBOX/.test(w)));

        const off = await call('PUT', '/settings', { providers: { razorpay: { enabled: false } }, reason: 'no India yet' });
        assert.equal(off.status, 200);
        assert.equal(off.body.data.providers.find((p) => p.id === 'razorpay').available, false);
        assert.deepEqual(await settings.resolveProviders({ country: 'IN', currency: 'INR' }), ['stripe']);
        const bad = await call('PUT', '/settings', { countryRules: [{ country: 'PL', providers: ['razorpay'] }, { country: '*', providers: ['stripe'] }] });
        assert.equal(bad.status, 400);
        assert.match(bad.body.message, /Razorpay cannot charge PLN/);

        const { AdminAuditLog } = await import('../src/modules/food/admin/models/auditLog.model.js');
        const audit = await AdminAuditLog.findOne({ action: 'payments.settings.update' }).lean();
        assert.ok(audit, 'settings changes are written to the audit log');
        assert.equal(audit.reason, 'no India yet');

        assert.equal((await call('POST', '/providers/przelewy24/test')).body.data.ok, true);
        assert.equal((await call('POST', '/providers/bitcoin/test')).status, 404);

        const paid = await paidP24();
        const list = await call('GET', `/transactions?q=${paid.publicId}`);
        assert.equal(list.body.data.total, 1);
        assert.equal(list.body.data.transactions[0].amount, 100);
        assert.equal(list.body.data.transactions[0].fulfilmentError.length > 0, true);
        const attention = await call('GET', '/transactions?status=attention');
        assert.ok(attention.body.data.transactions.some((t) => t.id === paid.publicId));
        const detail = await call('GET', `/transactions/${paid.publicId}`);
        assert.ok(detail.body.data.events.some((e) => e.type === 'paid'));

        const pending = await topup();
        p24State.sessions.get(pending.transaction.publicId).status = 1;
        const recheck = await call('POST', `/transactions/${pending.transaction.publicId}/recheck`);
        assert.equal(recheck.body.data.status, 'paid');

        const refund = await call('POST', `/transactions/${paid.publicId}/refund`, { amount: 25, reason: 'goodwill' });
        assert.equal(refund.status, 200);
        assert.equal(refund.body.data.refunded, 25);
        const over = await call('POST', `/transactions/${paid.publicId}/refund`, { amount: 500 });
        assert.equal(over.status, 400);
    } finally {
        await new Promise((r) => server.close(r));
    }
});
