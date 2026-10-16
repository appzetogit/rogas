/**
 * The hub hand-over through the real HTTP routes: the vendor pickup, the collection that sends a cross-zone item into transit, the
 * driver route with hub tasks, the hub operator screen, PIN 1 and PIN 2, and the zone driver delivering and being paid.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/hubRoutes.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

process.env.PAYMENTS_MODE = 'mock';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { connect, disconnect, seedWorld, setControl, nextPhone, WARSAW, acceptAssignment } = await import('./helpers/amendmentFixtures.mjs');
const { readCollectionPin } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js');

let w, server, base, tm, tokens, source, zoneDriver, order, transfer, DMBHubTransfer, CollectionBatch;

const call = async (method, path, { token, body } = {}) => {
    const res = await fetch(`${base}${path}`, {
        method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => ({}));
    return { status: res.status, body: json };
};

before(async () => {
    await connect('hub_routes_test');
    w = await seedWorld();
    tm = await import('../src/utils/platformTime.js');
    ({ DMBHubTransfer } = await import('../src/modules/dailymealbox/delivery/hub.models.js'));
    ({ CollectionBatch } = await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js'));
    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    const earnings = await import('../src/modules/dailymealbox/delivery/driverEarnings.service.js');
    const planner = await import('../src/modules/dailymealbox/delivery/cellPlanner.service.js');
    const tomorrow = tm.addDays(tm.localToday(), 1);

    await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '00:00', endTime: '23:59', maxPrepMinutes: 1, driverStartTime: '23:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true, hubOperatorName: 'Jan' } });
    await earnings.saveRate({ ratePln: 8, hubStopRate: 3, effectiveFrom: '2000-01-01' });

    source = await w.FoodDeliveryPartner.create({ name: 'Source', phone: nextPhone(), status: 'approved', zoneIds: [w.zone2._id], primaryZoneId: w.zone2._id, availabilityStatus: 'online' });
    zoneDriver = await w.FoodDeliveryPartner.create({ name: 'ZoneDriver', phone: nextPhone(), status: 'approved', zoneIds: [w.zone._id], primaryZoneId: w.zone._id, availabilityStatus: 'online' });
    await acceptAssignment(source, { zoneId: w.zone2._id, slotKeys: ['lunch'], days: [1] });
    await acceptAssignment(zoneDriver, { zoneId: w.zone._id, slotKeys: ['lunch'], days: [1] });
    const anna = await w.FoodUser.create({ phone: nextPhone(), name: 'Anna', role: 'USER' });
    order = await w.DMBDailyOrder.create({
        orderType: 'subscription', subscriptionId: new mongoose.Types.ObjectId(), userId: anna._id, vendorId: w.farVendor._id, zoneId: w.zone._id,
        meals: [{ name: 'Pierogi', quantity: 1 }], deliveryDate: tomorrow, deliverySlot: 'lunch', status: 'ready', deliveryPin: '4321',
        deliveryAddress: { street: 'Marszalkowska 1', city: 'Warsaw', state: 'Mazowieckie', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat] } }
    });
    await planner.splitCell({ zoneId: w.zone._id, date: tm.storageDateStr(tomorrow), slotKey: 'lunch' });
    transfer = await DMBHubTransfer.findOne({ unitId: order._id });
    const { triggerDriverNotificationIfAllReady } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.service.js');
    await triggerDriverNotificationIfAllReady(w.farVendor._id, tomorrow, 'lunch');

    tokens = {
        source: signAccessToken({ userId: String(source._id), role: 'DELIVERY_PARTNER' }),
        zone: signAccessToken({ userId: String(zoneDriver._id), role: 'DELIVERY_PARTNER' }),
        hub: signAccessToken({ userId: String(w.vendor2._id), role: 'RESTAURANT' }),
        notHub: signAccessToken({ userId: String(w.vendor._id), role: 'RESTAURANT' })
    };
    const app = express();
    app.use(express.json());
    app.use('/v1/dmb/driver', (await import('../src/core/auth/auth.middleware.js')).authMiddleware, (await import('../src/modules/dailymealbox/tracking/driver.routes.js')).default);
    app.use('/v1/dmb', (await import('../src/modules/dailymealbox/extra.routes.js')).default);
    app.use((await import('../src/middleware/errorHandler.js')).default);
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
    await new Promise((r) => server.close(r));
    await disconnect();
});

test('before collection: the source driver route has the vendor pickup and a hub task but no customer stop', async () => {
    const batch = await CollectionBatch.findOne({ vendorId: w.farVendor._id });
    assert.equal(String(batch.driverId), String(source._id), 'the pickup is the source driver');
    const route = await call('GET', '/v1/dmb/driver/my-route', { token: tokens.source });
    assert.equal(route.status, 200, JSON.stringify(route.body));
    assert.deepEqual(route.body.stops.map((s) => s.type), ['P'], 'one pickup stop');
    assert.equal(route.body.stops[0].boxCount, 1, 'the pickup still counts the hub item');
    assert.deepEqual(route.body.hubTasks.map((t) => [t.type, t.collected]), [['hub_dropoff', false]]);
    const zone = await call('GET', '/v1/dmb/driver/my-route', { token: tokens.zone });
    assert.deepEqual(zone.body.hubTasks.map((t) => [t.type, t.atHub]), [['hub_pickup', false]]);
});

test('the hub operator screen is for hubs only', async () => {
    assert.equal((await call('GET', '/v1/dmb/vendor/hub', { token: tokens.notHub })).body.isHub, false);
    const res = await call('GET', '/v1/dmb/vendor/hub', { token: tokens.hub });
    assert.equal(res.body.isHub, true);
    assert.equal(res.body.hub.operator, 'Jan');
    assert.equal(res.body.board.expected.length, 1);
});

test('collecting at the vendor sends the hub item into transit, not out for delivery', async () => {
    const batch = await CollectionBatch.findOne({ vendorId: w.farVendor._id });
    const wrong = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tokens.source, body: { pin: readCollectionPin(batch) === '0000' ? '1111' : '0000', vendorId: String(w.farVendor._id), slot: 'lunch' } });
    assert.equal(wrong.status, 400);
    const ok = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tokens.source, body: { pin: readCollectionPin(batch), vendorId: String(w.farVendor._id), slot: 'lunch' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const unit = await w.DMBDailyOrder.findById(order._id).lean();
    assert.equal(unit.status, 'hub_transit');
    assert.equal(String(unit.dispatch.deliveryPartnerId), String(zoneDriver._id), 'the delivery driver stays the zone driver');
    const route = await call('GET', '/v1/dmb/driver/my-route', { token: tokens.source });
    assert.deepEqual(route.body.stops, [], 'nothing is left on the source driver route but the hub drop');
    assert.deepEqual(route.body.hubTasks.map((t) => [t.type, t.collected]), [['hub_dropoff', true]]);
});

test('PIN 1 over HTTP: wrong PIN refused, the right one is accepted, and the hub then shows PIN 2', async () => {
    const board = (await call('GET', '/v1/dmb/vendor/hub', { token: tokens.hub })).body.board;
    assert.equal(board.incoming.length, 1);
    const pin1 = board.incoming[0].dropPin;
    const bad = await call('POST', `/v1/dmb/driver/hub/${transfer._id}/drop`, { token: tokens.source, body: { pin: pin1 === '0000' ? '1111' : '0000' } });
    assert.equal(bad.status, 400);
    assert.equal(bad.body.code, 'WRONG_PIN');
    assert.equal((await call('POST', `/v1/dmb/driver/hub/${transfer._id}/drop`, { token: tokens.zone, body: { pin: pin1 } })).status, 403, 'only the source driver');
    const good = await call('POST', `/v1/dmb/driver/hub/${transfer._id}/drop`, { token: tokens.source, body: { pin: pin1 } });
    assert.equal(good.status, 200, JSON.stringify(good.body));
    assert.equal(good.body.result.earning, 3);
    const after = (await call('GET', '/v1/dmb/vendor/hub', { token: tokens.hub })).body.board;
    assert.equal(after.holding.length, 1);
    assert.match(after.holding[0].pickupPin, /^\d{4}$/);
    assert.equal((await call('GET', '/v1/dmb/driver/hub-tasks', { token: tokens.source })).body.tasks.length, 0, 'the drop is done');
});

test('PIN 2 over HTTP, then the zone driver delivers to the customer with the delivery PIN and is paid the delivery rate', async () => {
    const pin2 = (await call('GET', '/v1/dmb/vendor/hub', { token: tokens.hub })).body.board.holding[0].pickupPin;
    assert.equal((await call('POST', `/v1/dmb/driver/hub/${transfer._id}/pickup`, { token: tokens.source, body: { pin: pin2 } })).status, 403, 'only the zone driver');
    const wrong = await call('POST', `/v1/dmb/driver/hub/${transfer._id}/pickup`, { token: tokens.zone, body: { pin: pin2 === '0000' ? '1111' : '0000' } });
    assert.equal(wrong.body.code, 'WRONG_PIN');
    const ok = await call('POST', `/v1/dmb/driver/hub/${transfer._id}/pickup`, { token: tokens.zone, body: { pin: pin2 } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));

    const route = await call('GET', '/v1/dmb/driver/my-route', { token: tokens.zone });
    assert.equal(route.status, 200, JSON.stringify(route.body));
    const drops = route.body.stops.filter((s) => s.type === 'D');
    assert.equal(drops.length, 1, 'the delivery is on the zone driver route');
    assert.equal(String(drops[0].orderId), String(order._id));

    const bad = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: tokens.zone, body: { orderId: String(order._id), pin: '0000' } });
    assert.equal(bad.status, 400);
    const delivered = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: tokens.zone, body: { orderId: String(order._id), pin: '4321' } });
    assert.equal(delivered.status, 200, JSON.stringify(delivered.body));
    assert.equal((await w.DMBDailyOrder.findById(order._id).lean()).status, 'delivered');
    const paid = await call('POST', '/v1/dmb/driver/confirm-payment', { token: tokens.zone, body: { orderId: String(order._id), method: 'ONLINE' } });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.riderEarning, 8);
    assert.equal((await call('POST', '/v1/dmb/driver/confirm-payment', { token: tokens.zone, body: { orderId: String(order._id), method: 'ONLINE' } })).status, 400, 'paid once');
    assert.equal((await w.FoodDeliveryPartner.findById(source._id).lean()).earningsToday, 3, 'the source driver keeps only the hub stop');
    assert.equal((await w.FoodDeliveryPartner.findById(zoneDriver._id).lean()).earningsToday, 8);
});
