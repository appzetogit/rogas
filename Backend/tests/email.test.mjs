/**
 * Integration tests for the transactional email service (queue, translation, retry/backoff, admin API).
 * The SMTP transporter is replaced by a fake (_setTransporterForTests) — no real network or credentials involved.
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards, and refuses to run against anything that is not localhost.
 *
 *   EMAIL_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/email.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

const BASE_URI = process.env.EMAIL_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error(`Refusing to run: EMAIL_TEST_MONGO_URI must be a plain local mongod (got ${BASE_URI.replace(/\/\/.*@/, '//***@')})`);
}
const DB_NAME = `email_test_${Date.now()}`;

// Real (non-secret) SMTP-shaped env values so isSmtpConfigured()/the admin overview behave like a configured
// server; the transporter itself is swapped out below, so nothing ever touches the network.
Object.assign(process.env, {
    EMAIL_HOST: 'smtp.example.test',
    EMAIL_PORT: '587',
    EMAIL_USER: 'no-reply@example.test',
    EMAIL_PASS: 'not-a-real-secret',
    EMAIL_FROM: 'DailyMealBox <no-reply@example.test>'
});

const CATALOG = { common: [], customer: [], vendor: [], driver: [], office: [], notifications: [], email: ['Test subject {{name}}', 'Test body for {{name}}.'] };
const PL = { email: { 'Test subject {{name}}': 'Testowy temat {{name}}', 'Test body for {{name}}.': 'Testowa treść dla {{name}}.' } };
const EN = {};

const writeSeed = async (seedDir, catalog, translations) => {
    await fs.mkdir(path.join(seedDir, 'translations'), { recursive: true });
    await fs.writeFile(path.join(seedDir, 'catalog.json'), JSON.stringify(catalog));
    for (const [lang, byNs] of Object.entries(translations)) {
        await fs.mkdir(path.join(seedDir, 'translations', lang), { recursive: true });
        for (const [ns, map] of Object.entries(byNs)) {
            await fs.writeFile(path.join(seedDir, 'translations', lang, `${ns}.json`), JSON.stringify(map));
        }
    }
};

let seedDir;
let emailSvc, emailModels, restaurantModel;

const fakeTransport = ({ fail = false, verifyOk = true } = {}) => {
    const sent = [];
    return {
        sent,
        sendMail: async (opts) => {
            if (fail) throw new Error('simulated SMTP failure');
            sent.push(opts);
            return { messageId: 'test-message-id' };
        },
        verify: async () => {
            if (!verifyOk) throw new Error('simulated verify failure');
            return true;
        }
    };
};

before(async () => {
    seedDir = await fs.mkdtemp(path.join(os.tmpdir(), 'email-seed-'));
    await writeSeed(seedDir, CATALOG, { pl: PL, en: EN });
    process.env.I18N_SEED_DIR = seedDir;

    await mongoose.connect(BASE_URI, { dbName: DB_NAME });
    const i18nSvc = await import('../src/modules/i18n/i18n.service.js');
    await i18nSvc.ensureSeeded();

    emailSvc = await import('../src/modules/email/email.service.js');
    emailModels = await import('../src/modules/email/email.models.js');
    ({ FoodRestaurant: restaurantModel } = await import('../src/modules/food/restaurant/models/restaurant.model.js'));
});

after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
    await fs.rm(seedDir, { recursive: true, force: true });
});

beforeEach(async () => {
    await emailModels.EmailLog.deleteMany({});
    emailSvc._setTransporterForTests(undefined);
});

const makeVendor = (over = {}) => restaurantModel.create({ restaurantName: 'Test Kitchen', ownerName: 'Test Owner', pureVegRestaurant: false, ...over });

test('queueEmail sends immediately and records the log as sent', async () => {
    const trans = fakeTransport();
    emailSvc._setTransporterForTests(trans);

    const log = await emailSvc.queueEmail({ to: 'customer@example.test', subjectKey: 'Test subject {{name}}', bodyKey: 'Test body for {{name}}.', vars: { name: 'Anna' } });

    assert.equal(log.status, 'sent');
    assert.equal(log.attempts, 1);
    assert.equal(log.language, 'en');
    assert.equal(log.subject, 'Test subject Anna');
    assert.match(log.html, /Test body for Anna\./);
    assert.equal(trans.sent.length, 1);
    assert.equal(trans.sent[0].to, 'customer@example.test');
    assert.equal(trans.sent[0].subject, 'Test subject Anna');

    const stored = await emailModels.EmailLog.findById(log._id).lean();
    assert.equal(stored.status, 'sent');
    assert.ok(stored.sentAt);
});

test('queueEmail resolves the recipient language from their account (same as push notifications)', async () => {
    const trans = fakeTransport();
    emailSvc._setTransporterForTests(trans);

    const vendor = await makeVendor({ languagePreference: 'pl' });
    const log = await emailSvc.queueEmail({
        to: 'vendor@example.test',
        subjectKey: 'Test subject {{name}}',
        bodyKey: 'Test body for {{name}}.',
        vars: { name: 'Kuchnia' },
        ownerType: 'RESTAURANT',
        ownerId: vendor._id
    });

    assert.equal(log.language, 'pl');
    assert.equal(log.subject, 'Testowy temat Kuchnia');
    assert.match(log.html, /Testowa treść dla Kuchnia\./);
});

test('a failed send is recorded as failed with a backoff, and is not lost', async () => {
    emailSvc._setTransporterForTests(fakeTransport({ fail: true }));

    const log = await emailSvc.queueEmail({ to: 'customer@example.test', subjectKey: 'Test subject {{name}}', bodyKey: 'Test body for {{name}}.', vars: { name: 'Anna' } });

    assert.equal(log.status, 'failed');
    assert.equal(log.attempts, 1);
    assert.match(log.lastError, /simulated SMTP failure/);
    assert.ok(log.nextAttemptAt.getTime() > Date.now());
});

test('retryFailed only retries rows whose backoff has elapsed, and stops once it succeeds', async () => {
    emailSvc._setTransporterForTests(fakeTransport({ fail: true }));
    const log = await emailSvc.queueEmail({ to: 'customer@example.test', subjectKey: 'Test subject {{name}}', bodyKey: 'Test body for {{name}}.', vars: { name: 'Anna' } });
    assert.equal(log.status, 'failed');

    // Not due yet: retryFailed leaves it alone.
    let result = await emailSvc.retryFailed();
    assert.equal(result.checked, 0);

    // Make it due, but the transporter is still broken: one more failed attempt.
    await emailModels.EmailLog.updateOne({ _id: log._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    result = await emailSvc.retryFailed();
    assert.equal(result.checked, 1);
    assert.equal(result.sent, 0);
    let stored = await emailModels.EmailLog.findById(log._id).lean();
    assert.equal(stored.attempts, 2);
    assert.equal(stored.status, 'failed');

    // Fix the transporter and make it due again: now it succeeds and is no longer picked up by retryFailed.
    const goodTrans = fakeTransport();
    emailSvc._setTransporterForTests(goodTrans);
    await emailModels.EmailLog.updateOne({ _id: log._id }, { $set: { nextAttemptAt: new Date(Date.now() - 1000) } });
    result = await emailSvc.retryFailed();
    assert.equal(result.checked, 1);
    assert.equal(result.sent, 1);
    stored = await emailModels.EmailLog.findById(log._id).lean();
    assert.equal(stored.status, 'sent');
    assert.equal(goodTrans.sent.length, 1);

    result = await emailSvc.retryFailed();
    assert.equal(result.checked, 0, 'a sent email is never picked up again');
});

test('resendById tries again immediately, ignoring the backoff schedule', async () => {
    emailSvc._setTransporterForTests(fakeTransport({ fail: true }));
    const log = await emailSvc.queueEmail({ to: 'customer@example.test', subjectKey: 'Test subject {{name}}', bodyKey: 'Test body for {{name}}.', vars: { name: 'Anna' } });
    assert.ok(log.nextAttemptAt.getTime() > Date.now(), 'backoff is in the future');

    const goodTrans = fakeTransport();
    emailSvc._setTransporterForTests(goodTrans);
    const after = await emailSvc.resendById(log._id);
    assert.equal(after.status, 'sent');
    assert.equal(after.attempts, 2);
});

test('testConnection reports success and failure without sending anything', async () => {
    emailSvc._setTransporterForTests(fakeTransport({ verifyOk: true }));
    assert.deepEqual(await emailSvc.testConnection(), { ok: true, message: 'Connected to the SMTP server.' });

    emailSvc._setTransporterForTests(fakeTransport({ verifyOk: false }));
    const bad = await emailSvc.testConnection();
    assert.equal(bad.ok, false);
    assert.match(bad.message, /simulated verify failure/);
});

// ─── Admin HTTP API ────────────────────────────────────────────────────────────

test('HTTP admin API: overview, test connection, log list, and resend', async () => {
    const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
    const { adminEmailRouter } = await import('../src/modules/email/email.admin.routes.js');
    const admin = await FoodAdmin.collection.insertOne({ name: 'Root', email: 'root-email@example.com', adminRole: 'SUPER_ADMIN', isActive: true });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { req.user = { userId: String(admin.insertedId), _id: String(admin.insertedId), role: 'ADMIN' }; next(); });
    app.use('/admin/email', adminEmailRouter);
    const server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    const url = `http://127.0.0.1:${server.address().port}`;
    const call = async (method, p, body) => {
        const res = await fetch(`${url}/admin/email${p}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
        return { status: res.status, body: await res.json() };
    };

    try {
        emailSvc._setTransporterForTests(fakeTransport());
        await emailSvc.queueEmail({ to: 'admin-test@example.test', subjectKey: 'Test subject {{name}}', bodyKey: 'Test body for {{name}}.', vars: { name: 'Anna' } });

        const overview = await call('GET', '/');
        assert.equal(overview.status, 200);
        assert.equal(overview.body.data.configured, true);
        assert.equal(overview.body.data.host, 'smtp.example.test');
        assert.equal(overview.body.data.stats.sent24h, 1);
        assert.equal(JSON.stringify(overview.body).includes('not-a-real-secret'), false, 'no secret ever leaves the server');

        const testRes = await call('POST', '/test');
        assert.equal(testRes.body.data.ok, true);

        const list = await call('GET', '/logs');
        assert.equal(list.body.data.logs.length, 1);
        assert.equal(list.body.data.logs[0].to, 'admin-test@example.test');
        const id = list.body.data.logs[0].id;

        const detail = await call('GET', `/logs/${id}`);
        assert.equal(detail.status, 200);
        assert.match(detail.body.data.html, /Test body for Anna\./);

        // Resend on an already-sent email still works (admins may want to re-trigger a delivery).
        const resend = await call('POST', `/logs/${id}/resend`, { reason: 'customer says they never got it' });
        assert.equal(resend.status, 200);
        assert.equal(resend.body.data.status, 'sent');

        const { AdminAuditLog } = await import('../src/modules/food/admin/models/auditLog.model.js');
        const audit = await AdminAuditLog.findOne({ action: 'email.resend' }).lean();
        assert.ok(audit, 'resend is written to the audit log');
        assert.equal(audit.reason, 'customer says they never got it');
    } finally {
        await new Promise((r) => server.close(r));
    }
});
