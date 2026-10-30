/**
 * The vendor app's "My Subscription Plans" screen calls four endpoints. They once did not exist on the server (the logic
 * was written but never connected), which showed "Failed to load your plans" in production. This test keeps them wired.
 * No database needed:   node --test tests/vendorPlanRoutes.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vendorRouter from '../src/modules/dailymealbox/vendor/vendor.routes.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const routeFor = (method, routePath) =>
    vendorRouter.stack.map((l) => l.route).find((r) => r && r.path === routePath && r.methods[method]);

for (const [method, routePath] of [['get', '/subscription-plans'], ['post', '/subscription-plans'], ['put', '/subscription-plans/:planId'], ['delete', '/subscription-plans/:planId']]) {
    test(`vendor router has ${method.toUpperCase()} ${routePath}, behind a login and the vendor role`, () => {
        const route = routeFor(method, routePath);
        assert.ok(route, `${method.toUpperCase()} /api/v1/dmb/vendor${routePath} is not defined`);
        const handlers = route.stack.map((s) => s.name || s.handle?.name);
        assert.ok(route.stack.length >= 3, 'login check, role check and the handler');
        assert.ok(handlers.includes('authMiddleware'), `no login check on ${method.toUpperCase()} ${routePath}: ${handlers.join(', ')}`);
    });
}

test('every plan endpoint the vendor app calls is defined on the server', () => {
    const api = fs.readFileSync(path.join(here, '../../Frontend/src/services/api/index.js'), 'utf8');
    const called = [...api.matchAll(/restaurantClient\.(get|post|put|delete)\(\s*[`"']\/dmb\/vendor\/(subscription-plans[^`"']*)[`"']/g)]
        .map(([, method, p]) => [method, '/' + p.replace(/\$\{[^}]+\}/g, ':planId')]);
    assert.ok(called.length >= 4, 'the app should call get/post/put/delete on subscription-plans');
    for (const [method, routePath] of called) assert.ok(routeFor(method, routePath), `the app calls ${method.toUpperCase()} ${routePath} but the server does not define it`);
});

test('My Subscribers and the per-plan subscriber counts share one definition', async () => {
    const { readFileSync } = await import('node:fs');
    const routes = readFileSync(new URL('../src/modules/dailymealbox/vendor/vendor.routes.js', import.meta.url), 'utf8');
    const plans = readFileSync(new URL('../src/modules/dailymealbox/subscription/vendorPlans.service.js', import.meta.url), 'utf8');
    assert.match(routes, /DMBSubscription\.find\(vendorSubscribersFilter\(/);
    assert.match(plans, /\.\.\.vendorSubscribersFilter\(vendorId\)/);
    const { vendorSubscribersFilter, LIVE } = await import('../src/modules/dailymealbox/subscription/vendorPlans.service.js');
    assert.deepEqual(LIVE, ['active', 'paused']);
    const f = vendorSubscribersFilter('6ac0b14b41784a3cddc539bb');
    assert.equal(f.$or.length, 2);
    assert.ok(!f.status.$in.includes('pending_payment'));
});
