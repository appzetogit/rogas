/**
 * Staying signed in: an expired access token must be renewed by the refresh token for EVERY panel (customer, vendor,
 * driver, admin), over the real HTTP routes, and the session must survive many renewals and concurrent ones.
 * The access token here lives 2 seconds so a few seconds of waiting replace a day.
 *
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/sessionRefresh.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';

process.env.JWT_ACCESS_SECRET = 'test-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.JWT_ACCESS_EXPIRES = '2s';
process.env.JWT_REFRESH_EXPIRES = '6s';

const { connect, disconnect, seedWorld, nextPhone } = await import('./helpers/amendmentFixtures.mjs');

let w, server, base, driver;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json, data: json.data };
};

before(async () => {
    await connect('session_test');
    w = await seedWorld();
    driver = await w.FoodDeliveryPartner.create({ name: 'Dariusz', phone: '600123456', countryCode: '+48', status: 'approved' });
    const { authMiddleware } = await import('../src/core/auth/auth.middleware.js');
    const app = express();
    app.use(express.json());
    app.use('/v1/food/auth', (await import('../src/core/auth/auth.routes.js')).default);
    app.get('/v1/whoami', authMiddleware, (req, res) => res.json({ success: true, user: req.user }));
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
    await new Promise((r) => server.close(r));
    await disconnect();
});

const logins = {
    customer: async () => {
        const phone = '48600111222';
        const otp = (await call('POST', '/v1/food/auth/user/request-otp', { body: { phone } })).data.otp;
        return (await call('POST', '/v1/food/auth/user/verify-otp', { body: { phone, otp } })).data;
    },
    vendor: async () => {
        const phone = w.vendor.ownerPhone;
        const otp = (await call('POST', '/v1/food/auth/restaurant/request-otp', { body: { phone } })).data.otp;
        return (await call('POST', '/v1/food/auth/restaurant/verify-otp', { body: { phone, otp } })).data;
    },
    driver: async () => {
        const phone = '+48600123456';
        const otp = (await call('POST', '/v1/food/auth/delivery/request-otp', { body: { phone } })).data.otp;
        return (await call('POST', '/v1/food/auth/delivery/verify-otp', { body: { phone, otp } })).data;
    },
    admin: async () => (await call('POST', '/v1/food/auth/admin/login', { body: { email: w.admin.email, password: 'Secret123!' } })).data
};

for (const [panel, login] of Object.entries(logins)) {
    test(`${panel}: an expired access token is renewed by the refresh token, again and again, also concurrently`, async () => {
        const session = await login();
        assert.ok(session?.accessToken && session?.refreshToken, `${panel} login gave no tokens: ${JSON.stringify(session)}`);
        let { accessToken, refreshToken } = session;
        assert.equal((await call('GET', '/v1/whoami', { token: accessToken })).status, 200);

        for (let round = 1; round <= 3; round++) {
            await sleep(2300); // the access token has expired
            const expired = await call('GET', '/v1/whoami', { token: accessToken });
            assert.equal(expired.status, 401, 'expired access token is refused');

            // Three tabs refresh at the same moment with the same refresh token: all must succeed.
            const results = await Promise.all([1, 2, 3].map(() => call('POST', '/v1/food/auth/refresh-token', { body: { refreshToken } })));
            for (const r of results) assert.equal(r.status, 200, `round ${round}: refresh failed status=${r.status} ${JSON.stringify(r.body)}`);
            accessToken = results[0].data.accessToken;
            if (results[0].data.refreshToken) refreshToken = results[0].data.refreshToken; // sliding session
            const ok = await call('GET', '/v1/whoami', { token: accessToken });
            assert.equal(ok.status, 200, `round ${round}: the renewed token must work: ${JSON.stringify(ok.body)}`);
            assert.ok(ok.body.user.role, 'the renewed token keeps the role');
        }
    });
}

test('the session outlives the first refresh token because it slides forward while the person keeps using the app', async () => {
    const session = await logins.customer();
    let refreshToken = session.refreshToken;
    const seen = new Set([refreshToken]);
    // 6 s refresh lifetime: keep using it for ~10 s; without sliding the session would be dead after 6 s.
    for (let i = 0; i < 5; i++) {
        await sleep(2000);
        const r = await call('POST', '/v1/food/auth/refresh-token', { body: { refreshToken } });
        assert.equal(r.status, 200, `refresh ${i + 1} (${(i + 1) * 2}s in): ${JSON.stringify(r.body)}`);
        if (r.data.refreshToken) { refreshToken = r.data.refreshToken; seen.add(refreshToken); }
    }
    assert.ok(seen.size > 1, 'a fresh refresh token was handed out');
});

test('a wrong or unknown refresh token is refused (and only then is anybody signed out)', async () => {
    assert.equal((await call('POST', '/v1/food/auth/refresh-token', { body: { refreshToken: 'garbage' } })).status, 401);
});
