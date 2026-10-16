/**
 * Pantry shops across the sub-zones of the customer's own city: listed (flagged), refused for another city or an address outside
 * every zone, priced with the flat surcharge once per slot, and the paid bag travels through the hub like a meal.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/pantryCrossZone.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';

process.env.PAYMENTS_MODE = 'mock';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { connect, disconnect, seedWorld, setControl, clearControls, nextPhone, WARSAW, acceptAssignment } = await import('./helpers/amendmentFixtures.mjs');

let w, server, base, tm, hub, planner, PantryOrder, FoodItem, DMBHubTransfer, shopFar, shopNear, itemFar, itemNear, token, user, tomorrow;

before(async () => {
    await connect('pantry_cross_zone_test');
    w = await seedWorld();
    tm = await import('../src/utils/platformTime.js');
    hub = await import('../src/modules/dailymealbox/delivery/hub.service.js');
    planner = await import('../src/modules/dailymealbox/delivery/cellPlanner.service.js');
    ({ PantryOrder } = await import('../src/modules/food/restaurant/models/pantryOrder.model.js'));
    ({ FoodItem } = await import('../src/modules/food/admin/models/food.model.js'));
    ({ DMBHubTransfer } = await import('../src/modules/dailymealbox/delivery/hub.models.js'));
    tomorrow = tm.addDays(tm.localToday(), 1);
    await w.DeliverySlot.create({ key: 'lunch', name: 'Lunch', startTime: '08:00', endTime: '14:00', maxPrepMinutes: 60, driverStartTime: '12:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true });
    const at = (z, d) => ({ type: 'Point', coordinates: [WARSAW.lng + d, WARSAW.lat + d], latitude: WARSAW.lat + d, longitude: WARSAW.lng + d });
    shopNear = await w.FoodRestaurant.create({ restaurantName: 'Near Pantry', ownerName: 'N', ownerPhone: nextPhone(), status: 'approved', zoneId: w.zone._id, vendorType: 'pantry_shop', location: at(w.zone, 0.004) });
    shopFar = await w.FoodRestaurant.create({ restaurantName: 'South Pantry', ownerName: 'S', ownerPhone: nextPhone(), status: 'approved', zoneId: w.zone2._id, vendorType: 'pantry_shop', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat - 0.2], latitude: WARSAW.lat - 0.2, longitude: WARSAW.lng } });
    itemNear = await FoodItem.create({ restaurantId: shopNear._id, name: 'Milk', price: 4, isAvailable: true, approvalStatus: 'approved' });
    itemFar = await FoodItem.create({ restaurantId: shopFar._id, name: 'Bread', price: 6, isAvailable: true, approvalStatus: 'approved' });
    user = await w.FoodUser.create({ phone: nextPhone(), name: 'Anna', role: 'USER' });
    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    token = signAccessToken({ userId: String(user._id), role: 'USER' });
    const app = express();
    app.use(express.json());
    app.use('/v1/dmb/pantry-orders', (await import('../src/modules/dailymealbox/vendor/pantryOrder.routes.js')).default);
    app.use('/v1/dmb/vendor', (await import('../src/modules/dailymealbox/vendor/vendor.routes.js')).default);
    app.use((await import('../src/middleware/errorHandler.js')).default);
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((r) => server.close(r)); await disconnect(); });

beforeEach(async () => {
    await clearControls();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('maxSlotsPerDay', { value: 3 });
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });
    await w.FoodRestaurant.updateMany({}, { $set: { isHub: false } });
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true, hubOperatorName: 'Jan', hubCapacity: null } });
    await PantryOrder.deleteMany({});
    await DMBHubTransfer.deleteMany({});
});

const call = async (method, path, body) => {
    const res = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    return { status: res.status, body: await res.json().catch(() => ({})) };
};
const ymd = (d) => tm.storageDateStr(d);
const southAddress = { street: 'Home', city: 'Warsaw', state: 'Mazowieckie', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat] } };
const buy = (shop, item, over = {}) => call('POST', '/v1/dmb/pantry-orders/checkout', {
    vendorId: String(shop._id), deliveryAddress: southAddress, provider: 'mock',
    groups: [{ items: [{ pantryItemId: String(item._id), quantity: 1 }], deliveryDates: [ymd(tomorrow)], deliverySlots: ['lunch'], ...over }]
});

test('the shop list shows the own sub-zone and the other sub-zones of the city (flagged); off, or without a hub, only the own', async () => {
    const list = async () => (await call('GET', `/v1/dmb/vendor/pantry-items/all?zoneId=${w.zone._id}`)).body.items;
    const items = await list();
    const far = items.find((i) => String(i._id) === String(itemFar._id));
    assert.ok(far && far.crossZone === true);
    assert.equal(items.find((i) => String(i._id) === String(itemNear._id)).crossZone, false);
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: false } });
    assert.ok(!(await list()).some((i) => String(i._id) === String(itemFar._id)));
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { isHub: true } });
    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    assert.ok(!(await list()).some((i) => String(i._id) === String(itemFar._id)));
});

test('checkout: own sub-zone has no surcharge; another sub-zone adds the flat surcharge once and stores the customer zone', async () => {
    const own = await buy(shopNear, itemNear);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    const o1 = await PantryOrder.findOne({ vendorId: shopNear._id });
    assert.equal(o1.crossZone, false);
    assert.equal(String(o1.zoneId), String(w.zone._id));
    assert.equal(o1.pricing.crossZoneSurcharge, 0);
    await PantryOrder.deleteMany({});

    const far = await buy(shopFar, itemFar);
    assert.equal(far.status, 200, JSON.stringify(far.body));
    const o2 = await PantryOrder.findOne({ vendorId: shopFar._id });
    assert.equal(o2.crossZone, true);
    assert.equal(String(o2.zoneId), String(w.zone._id), 'the order belongs to the CUSTOMER zone');
    assert.equal(o2.pricing.crossZoneSurcharge, 3);
    // a second bag in the same slot pays no second surcharge
    const again = await buy(shopFar, itemFar);
    assert.equal(again.status, 200);
    const second = (await PantryOrder.find({ vendorId: shopFar._id }).sort({ createdAt: 1 }))[1];
    assert.equal(second.pricing.crossZoneSurcharge, 0);
});

test('checkout refuses: switch off or no hub (shop does not deliver here), an address outside every zone, another city', async () => {
    await setControl('crossZoneDelivery', { enabled: false, surchargePln: 3 });
    const off = await buy(shopFar, itemFar);
    assert.equal(off.status, 400);
    assert.equal(off.body.code, 'ZONE_MISMATCH');
    await setControl('crossZoneDelivery', { enabled: true, surchargePln: 3 });

    const outside = await call('POST', '/v1/dmb/pantry-orders/checkout', {
        vendorId: String(shopNear._id), provider: 'mock', deliveryAddress: { ...southAddress, location: { type: 'Point', coordinates: [18.6466, 54.352] } },
        groups: [{ items: [{ pantryItemId: String(itemNear._id), quantity: 1 }], deliveryDates: [ymd(tomorrow)], deliverySlots: ['lunch'] }]
    });
    assert.equal(outside.status, 400);
    assert.equal(outside.body.code, 'OUTSIDE_ZONES');

    const KRAKOW = { lat: 50.0647, lng: 19.945 };
    const sq = (d) => [{ latitude: KRAKOW.lat - d, longitude: KRAKOW.lng - d }, { latitude: KRAKOW.lat - d, longitude: KRAKOW.lng + d }, { latitude: KRAKOW.lat + d, longitude: KRAKOW.lng + d }, { latitude: KRAKOW.lat + d, longitude: KRAKOW.lng - d }];
    const z3 = await w.FoodZone.create({ name: `Krakow ${Date.now()}`, country: 'Poland', coordinates: sq(0.05) });
    await w.AdminCity.create({ name: `Krakow ${Date.now()}`, country: 'PL', currency: 'PLN', status: 'active', zoneIds: [z3._id] });
    const foreign = await w.FoodRestaurant.create({ restaurantName: 'Krakow Pantry', ownerName: 'K', ownerPhone: nextPhone(), status: 'approved', zoneId: z3._id, vendorType: 'pantry_shop', location: { type: 'Point', coordinates: [KRAKOW.lng, KRAKOW.lat], latitude: KRAKOW.lat, longitude: KRAKOW.lng } });
    const fi = await FoodItem.create({ restaurantId: foreign._id, name: 'Rye', price: 5, isAvailable: true, approvalStatus: 'approved' });
    const other = await buy(foreign, fi);
    assert.equal(other.status, 400);
    assert.equal(other.body.code, 'ZONE_MISMATCH');
    assert.equal(await PantryOrder.countDocuments({ status: 'pending_payment' }), 0, 'no orphan orders');
});

test('a paid cross-zone bag becomes a hub transfer: source driver of the shop zone, zone driver of the customer; hand-over puts it on the route', async () => {
    const created = await buy(shopFar, itemFar);
    assert.equal(created.status, 200);
    const po = await PantryOrder.findOne({ vendorId: shopFar._id });
    await PantryOrder.updateOne({ _id: po._id }, { $set: { status: 'paid' } });
    const bag = (await PantryOrder.findById(po._id)).dailyDeliveries[0];
    const mk = (zone, name) => w.FoodDeliveryPartner.create({ name, phone: nextPhone(), status: 'approved', zoneIds: [zone._id], primaryZoneId: zone._id });
    const source = await mk(w.zone2, 'Source'); const zoneDriver = await mk(w.zone, 'ZoneDriver');
    await acceptAssignment(source, { zoneId: w.zone2._id, slotKeys: ['lunch'], days: [1] });
    await acceptAssignment(zoneDriver, { zoneId: w.zone._id, slotKeys: ['lunch'], days: [1] });

    await planner.splitCell({ zoneId: w.zone._id, date: ymd(tomorrow), slotKey: 'lunch' });
    const t = await DMBHubTransfer.findOne({ unitId: bag._id });
    assert.ok(t, 'a transfer exists for the bag');
    assert.equal(t.unitKind, 'pantry');
    assert.equal(String(t.sourceDriverId), String(source._id));
    assert.equal(String(t.zoneDriverId), String(zoneDriver._id));
    assert.equal(t.items[0].description, 'Bread');

    assert.deepEqual(await hub.markCollectedForHub({ unitIds: [String(bag._id)], driverId: source._id }), [String(bag._id)]);
    assert.equal((await PantryOrder.findById(po._id)).dailyDeliveries[0].status, 'hub_transit');
    const board = await hub.hubBoard({ hubVendorId: w.vendor2._id });
    const drop = board.incoming.find((x) => String(x.transferId) === String(t._id));
    assert.ok(drop?.dropPin);
    await hub.dropAtHub({ transferId: t._id, driverId: source._id, pin: drop.dropPin });
    const held = (await hub.hubBoard({ hubVendorId: w.vendor2._id })).holding.find((x) => String(x.transferId) === String(t._id));
    await hub.pickupAtHub({ transferId: t._id, driverId: zoneDriver._id, pin: held.pickupPin });
    const after = (await PantryOrder.findById(po._id)).dailyDeliveries[0];
    assert.equal(after.status, 'out_for_delivery');
    assert.equal(String(after.driverId), String(zoneDriver._id));
    const tasks = await hub.driverHubTasks({ driverId: source._id });
    assert.ok(Array.isArray(tasks));
});
