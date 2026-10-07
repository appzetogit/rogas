/**
 * Pantry + meal subscription, end to end over the real HTTP routes, with TWO vendors and ONE driver:
 *   customer has a meal subscription (kitchen A) and buys a Pantry bag (shop B) for the same day and slot →
 *   server prices the bag and takes ONE payment → shop B sees it, kitchen A marks its meal ready →
 *   the driver's route shows BOTH pickups → the driver collects from A (PIN) and from B (PIN) →
 *   the customer's two delivery PINs are checked at the door → the driver is credited per drop →
 *   edge cases: wrong PINs, locked PIN, someone else's PIN, double delivery, failed payment, price changes, other
 *   customers' / vendors' orders, a failed delivery returning to the shop.
 *
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27017 node --test tests/pantryFlow.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

process.env.PAYMENTS_MODE = 'mock';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { connect, disconnect, seedWorld, setControl, nextWeekday, nextPhone, WARSAW } = await import('./helpers/amendmentFixtures.mjs');

let M = {};
let w, server, base, time, shop, milk, bread, driver, tok, subscription, mealOrder, today, todayStr, pantryOrderIds;
const SLOT = 'lunch';

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
    await connect('pantry_flow_test');
    w = await seedWorld();
    time = await import('../src/utils/platformTime.js');
    const { listSlots } = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    await listSlots();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('maxSlotsPerDay', { value: 3 });

    M = {
        PantryOrder: (await import('../src/modules/food/restaurant/models/pantryOrder.model.js')).PantryOrder,
        FoodItem: (await import('../src/modules/food/admin/models/food.model.js')).FoodItem,
        FoodRestaurant: w.FoodRestaurant,
        CollectionBatch: (await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js')).CollectionBatch,
        DeliverySlot: w.DeliverySlot,
        Commission: (await import('../src/modules/food/admin/models/restaurantCommission.model.js')).FoodRestaurantCommission,
        Fee: w.DeliveryOrderFeeSettings,
        Tx: (await import('../src/modules/payments/payments.models.js')).PaymentTransaction
    };

    // Lunch is the only slot "now" for the driver route; the others are switched off so the test is independent of the clock.
    await M.DeliverySlot.updateMany({ key: 'breakfast' }, { $set: { isEnabled: false } });
    await M.DeliverySlot.updateOne({ key: SLOT }, { $set: { startTime: '00:00', endTime: '23:59', availableDays: [0, 1, 2, 3, 4, 5, 6] } });
    const { listSlots: reload } = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    await reload();
    await M.Fee.updateMany({}, { $set: { feePerOrder: 5 } });
    await (await import('../src/modules/food/admin/models/feeSettings.model.js')).FoodFeeSettings.create({ platformFee: 2, isActive: true });

    // Pantry shop (vendor B) with two items, 8% food VAT.
    shop = await M.FoodRestaurant.create({
        restaurantName: 'Corner Pantry', ownerName: 'Pawel', ownerPhone: nextPhone(), status: 'approved', zoneId: w.zone._id, vendorType: 'pantry_shop',
        location: { type: 'Point', coordinates: [WARSAW.lng + 0.005, WARSAW.lat + 0.005], latitude: WARSAW.lat + 0.005, longitude: WARSAW.lng + 0.005 }
    });
    await M.Commission.create({ restaurantId: shop._id, foodVatPercent: 8 });
    milk = await M.FoodItem.create({ restaurantId: shop._id, name: 'Milk 1L', price: 4, isAvailable: true });
    bread = await M.FoodItem.create({ restaurantId: shop._id, name: 'Bread', price: 6, isAvailable: true });

    driver = await w.FoodDeliveryPartner.create({
        name: 'Dariusz', phone: nextPhone(), status: 'approved', availabilityStatus: 'online', zoneIds: [w.zone._id],
        allowedShifts: [SLOT], assignedVendors: [w.vendor._id, shop._id]
    });

    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    const other = await w.FoodUser.create({ phone: nextPhone(), name: 'Other Customer', role: 'USER' });
    tok = {
        user: signAccessToken({ userId: String(w.user._id), role: 'USER' }),
        other: signAccessToken({ userId: String(other._id), role: 'USER' }),
        kitchen: signAccessToken({ userId: String(w.vendor._id), role: 'RESTAURANT' }),
        shop: signAccessToken({ userId: String(shop._id), role: 'RESTAURANT' }),
        driver: signAccessToken({ userId: String(driver._id), role: 'DELIVERY_PARTNER' })
    };

    const app = express();
    app.use(express.json());
    app.use('/v1/dmb/subscriptions', (await import('../src/modules/dailymealbox/subscription/subscription.routes.js')).default);
    app.use('/v1/dmb/driver', (await import('../src/core/auth/auth.middleware.js')).authMiddleware, (await import('../src/modules/dailymealbox/tracking/driver.routes.js')).default);
    app.use('/v1/dmb/vendor', (await import('../src/modules/dailymealbox/vendor/vendor.routes.js')).default);
    app.use('/v1/dmb/pantry-orders', (await import('../src/modules/dailymealbox/vendor/pantryOrder.routes.js')).default);
    app.use('/v1/dmb/payments', (await import('../src/modules/dailymealbox/payment/dmb.payment.routes.js')).default);
    app.use('/v1/dmb', (await import('../src/modules/dailymealbox/extra.routes.js')).default);
    app.use('/v1/payments', (await import('../src/modules/payments/payments.routes.js')).paymentsRouter);
    app.use((await import('../src/middleware/errorHandler.js')).default);
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${server.address().port}`;

    today = time.localToday();
    todayStr = time.storageDateStr(today);
});

after(async () => {
    await new Promise((r) => server.close(r));
    await disconnect();
});

const checkout = (body, token = tok.user) => call('POST', '/v1/dmb/pantry-orders/checkout', { token, body: { vendorId: String(shop._id), deliveryAddress: w.address, provider: 'mock', ...body } });
const pay = (created, token = tok.user) => call('POST', `/v1/payments/${created.body.payment.transactionId}/mock-confirm`, { token });

test('1. customer buys a meal subscription (kitchen A); a meal order exists for today', async () => {
    const start = await nextWeekday(1, 1);
    const quote = await call('POST', '/v1/dmb/payments/quote', { token: tok.user, body: { subscriptionPlanId: String(w.plans.weekFull._id), vendorId: String(w.vendor._id), zoneId: String(w.zone._id), meals: [{ mealPlanId: String(w.meal._id), quantity: 1 }], deliverySlots: [SLOT], startDate: start } });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const created = await call('POST', '/v1/dmb/payments/create-order', { token: tok.user, body: { subscriptionPlanId: String(w.plans.weekFull._id), vendorId: String(w.vendor._id), zoneId: String(w.zone._id), meals: [{ mealPlanId: String(w.meal._id), quantity: 1 }], deliverySlots: [SLOT], startDate: start, deliveryAddress: w.address, expectedTotal: quote.body.quote.totals.total, provider: 'mock' } });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const paid = await pay(created);
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    subscription = await w.DMBSubscription.findOne({ userId: w.user._id });
    assert.equal(subscription.status, 'active');
    const gen = await import('../src/modules/dailymealbox/subscription/orderGeneration.js');
    await gen.generateForDate(new Date(start));
    mealOrder = await w.DMBDailyOrder.findOne({ subscriptionId: subscription._id });
    assert.ok(mealOrder, 'a daily meal order exists');
    // Bring that meal to today so the driver route (which only shows today) can be exercised.
    await w.DMBDailyOrder.updateOne({ _id: mealOrder._id }, { $set: { deliveryDate: today, deliverySlot: SLOT } });
    mealOrder = await w.DMBDailyOrder.findById(mealOrder._id);
});

test('2. pantry pricing: server prices from the database, ignores the browser price, every item/day/slot counted', async () => {
    // 2 milk (8) + 1 bread (6) = 14 per delivery; 1 day x 1 slot; VAT 8% = 1.12; platform fee 2  => 17.12
    const res = await checkout({ groups: [{ items: [{ pantryItemId: String(milk._id), quantity: 2, price: 0.01 }, { pantryItemId: String(bread._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: [SLOT] }] });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.orders.length, 1);
    const o = res.body.orders[0];
    assert.equal(o.status, 'pending_payment');
    assert.equal(o.pricing.itemsTotal, 14, 'a price sent by the browser is never trusted');
    assert.equal(o.pricing.total, 17.12);
    const tx = await M.Tx.findOne({ publicId: res.body.payment.transactionId }).lean();
    assert.equal(tx.amountMinor, 1712, 'the payment is for exactly the order total, in grosze');
    assert.equal(tx.currency, 'PLN');
    // pending order is invisible to the shop and the driver until paid
    const vend = await call('GET', `/v1/dmb/pantry-orders/vendor?date=${todayStr}`, { token: tok.shop });
    assert.equal(vend.body.orders.length, 0, 'unpaid orders are not shown to the shop');
    pantryOrderIds = res.body.orders.map((x) => x.orderId);
    await pay(res);
    const after = await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] }).lean();
    assert.equal(after.status, 'paid');
    assert.equal(after.paymentStatus, 'completed');
});

test('2b. pantry pricing edge cases', async () => {
    const g = (over = {}) => ({ items: [{ pantryItemId: String(milk._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: [SLOT], ...over });
    // Multi-day: 3 days x 1 slot
    const d = time.storageDateStr(time.addDays(today, 1)), d2 = time.storageDateStr(time.addDays(today, 2));
    const multi = await checkout({ groups: [g({ deliveryDates: [todayStr, d, d2] })] });
    assert.equal(multi.status, 200, JSON.stringify(multi.body));
    // 4 x 3 = 12 items + VAT + fee. VAT should be 8% of what is actually sold (12) = 0.96, fee 2 => 14.96
    assert.equal(multi.body.orders[0].pricing.total, 14.96, `3 days of a 4.00 item: items 12.00 + 8% VAT of 12.00 (0.96) + fee 2 = 14.96, got ${multi.body.orders[0].pricing.total}`);
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });

    // Two groups, different days and slots: only the real deliveries are charged (Mon lunch, Tue+Wed dinner = 3 deliveries)
    const two = await checkout({ groups: [g({ deliveryDates: [todayStr] }), g({ deliveryDates: [d, d2], deliverySlots: ['dinner'] })] });
    assert.equal(two.status, 200, JSON.stringify(two.body));
    const itemsCharged = two.body.orders.reduce((s, x) => s + x.pricing.total, 0);
    // 3 real deliveries of a 4.00 item = 12 (+ VAT + fee). The cart is wrongly multiplied by distinct dates x distinct slots (3 x 2 = 6) = 24.
    assert.ok(itemsCharged < 20, `two groups must be charged per delivery (about 14.96), got ${itemsCharged}`);
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });

    // Stale price warning
    const stale = await checkout({ groups: [g()], expectedTotal: 1 });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'PRICE_CHANGED');
    assert.equal(await M.PantryOrder.countDocuments({ status: 'pending_payment' }), 0, 'no orphan pending orders after a refused checkout');

    // Item of another shop, out of stock, bad quantity, empty cart, missing slot
    const foreign = await M.FoodItem.create({ restaurantId: w.vendor._id, name: 'Kitchen thing', price: 1 });
    assert.equal((await checkout({ groups: [g({ items: [{ pantryItemId: String(foreign._id), quantity: 1 }] })] })).status, 400, 'item of another vendor');
    await M.FoodItem.updateOne({ _id: bread._id }, { $set: { isAvailable: false } });
    assert.equal((await checkout({ groups: [g({ items: [{ pantryItemId: String(bread._id), quantity: 1 }] })] })).status, 400, 'out of stock');
    await M.FoodItem.updateOne({ _id: bread._id }, { $set: { isAvailable: true } });
    const neg = await checkout({ groups: [g({ items: [{ pantryItemId: String(milk._id), quantity: -5 }] })] });
    assert.equal(neg.body.orders?.[0]?.pricing.itemsTotal, 4, 'negative quantity is clamped to 1');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });
    assert.equal((await checkout({ groups: [] })).status, 400);
    assert.equal((await checkout({ groups: [g({ deliverySlots: [] })] })).status, 400);
    assert.equal((await checkout({ groups: [g()] }, null)).status, 401, 'login required');
    // unknown slot / past date / far-future date must be refused
    const badSlot = await checkout({ groups: [g({ deliverySlots: ['midnight_snack'] })] });
    assert.equal(badSlot.status, 400, 'an unknown delivery slot must be refused');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });
    const past = await checkout({ groups: [g({ deliveryDates: ['2020-01-01'] })] });
    assert.equal(past.status, 400, 'a delivery date in the past must be refused');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });
    const garbage = await checkout({ groups: [g({ deliveryDates: ['not-a-date'] })] });
    assert.equal(garbage.status, 400, 'an invalid date must be refused');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });
});

test('2d. delivery fee (admin "Pantry Delivery Fee") and per-item slots: lunch 50 + dinner 200 = 250 items, not 500', async () => {
    const { setPantryDeliveryFee } = await import('../src/modules/dailymealbox/platform/pantryFee.js');
    const cheap = await M.FoodItem.create({ restaurantId: shop._id, name: 'Lunch snack', price: 50 });
    const dear = await M.FoodItem.create({ restaurantId: shop._id, name: 'Dinner pack', price: 200 });
    const cart = { groups: [
        { items: [{ pantryItemId: String(cheap._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: ['lunch'] },
        { items: [{ pantryItemId: String(dear._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: ['dinner'] }
    ] };
    // No fee configured yet: free delivery.
    let res = await checkout(cart);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    // 250 + 8% VAT (20) + platform fee 2
    assert.equal(res.body.payment ? (await M.Tx.findOne({ publicId: res.body.payment.transactionId }).lean()).amountMinor : 0, 27200);
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });

    await setPantryDeliveryFee(3);
    res = await checkout(cart);
    // two deliveries (lunch + dinner) x 3 = 6 on top: 250 + 20 + 6 + 2 = 278
    assert.equal((await M.Tx.findOne({ publicId: res.body.payment.transactionId }).lean()).amountMinor, 27800);
    assert.equal(res.body.orders.reduce((n, o) => n + o.pricing.deliveryFee, 0), 6);
    assert.equal(Math.round(res.body.orders.reduce((n, o) => n + o.pricing.total, 0) * 100), 27800, 'the orders add up to the payment');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });

    // The same day + slot in two groups is one driver visit: charged once.
    res = await checkout({ groups: [
        { items: [{ pantryItemId: String(cheap._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: ['lunch'] },
        { items: [{ pantryItemId: String(dear._id), quantity: 1 }], deliveryDates: [todayStr, time.storageDateStr(time.addDays(today, 1))], deliverySlots: ['lunch'] }
    ] });
    assert.equal(res.body.orders.reduce((n, o) => n + o.pricing.deliveryFee, 0), 6, '2 distinct visits (today, tomorrow), not 3');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });

    // the public pricing config the checkout screen reads
    const cfg = await call('GET', `/v1/dmb/vendor/${shop._id}/pricing-config`);
    assert.equal(cfg.body.deliveryFeePerDelivery, 3);
    assert.equal(cfg.body.platformFee, 2);
    await setPantryDeliveryFee(0);
});

test('2e. size variants: the app sends "<itemId>-<variant>"; priced at the variant price, bad ids are a 400 not a 500', async () => {
    const rice = await M.FoodItem.create({ restaurantId: shop._id, name: 'Rice', price: 10, variants: [{ name: '500gm', price: 30 }, { name: '1 kg', price: 55 }] });
    const g = (id) => ({ groups: [{ items: [{ pantryItemId: id, quantity: 2 }], deliveryDates: [todayStr], deliverySlots: [SLOT] }] });
    const ok = await checkout(g(`${rice._id}-500gm`));
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal(ok.body.orders[0].items[0].price, 30);
    assert.equal(ok.body.orders[0].items[0].title, 'Rice - 500gm');
    assert.equal(ok.body.orders[0].pricing.itemsTotal, 60);
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });
    const spaced = await checkout(g(`${rice._id}-1 kg`));
    assert.equal(spaced.body.orders[0].pricing.itemsTotal, 110, 'names with spaces work');
    await M.PantryOrder.deleteMany({ status: 'pending_payment' });
    assert.equal((await checkout(g(`${rice._id}-2kg`))).status, 400, 'unknown variant');
    assert.equal((await checkout(g('not-an-id'))).status, 400, 'garbage id');
    assert.equal(await M.PantryOrder.countDocuments({ status: 'pending_payment' }), 0);
});

test('2c. failed / cancelled payment cancels the pending bag; a paid order is never cancelled by a late failure', async () => {
    const res = await checkout({ groups: [{ items: [{ pantryItemId: String(milk._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: [SLOT] }] });
    const id = res.body.orders[0].orderId;
    const tx = await M.Tx.findOne({ publicId: res.body.payment.transactionId });
    const { getPurpose } = await import('../src/modules/payments/purposes/index.js');
    await getPurpose('pantry').onFailed(tx);
    assert.equal((await M.PantryOrder.findOne({ orderId: id })).status, 'cancelled');
    // paid order unaffected by a late failure
    const paidId = pantryOrderIds[0];
    await getPurpose('pantry').onFailed({ refs: { orderIds: [paidId] } });
    assert.equal((await M.PantryOrder.findOne({ orderId: paidId })).status, 'paid');
    // idempotent onPaid
    await getPurpose('pantry').onPaid({ refs: { orderIds: [paidId] }, providerPaymentId: 'x' });
    assert.equal((await M.PantryOrder.findOne({ orderId: paidId })).status, 'paid');
});

test('3. customer sees both orders; other customers and other shops cannot see or touch the bag', async () => {
    const mine = await call('GET', '/v1/dmb/pantry-orders/my-orders', { token: tok.user });
    assert.ok(mine.body.orders.some((o) => o.orderId === pantryOrderIds[0] && o.status === 'paid'));
    const theirs = await call('GET', '/v1/dmb/pantry-orders/my-orders', { token: tok.other });
    assert.equal(theirs.body.orders.length, 0);
    const kitchenView = await call('GET', `/v1/dmb/pantry-orders/vendor?date=${todayStr}`, { token: tok.kitchen });
    assert.equal(kitchenView.body.orders.length, 0, 'the meal kitchen must not see the pantry shop\'s orders');
    const po = await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] });
    const dd = po.dailyDeliveries[0];
    const hijack = await call('PATCH', `/v1/dmb/pantry-orders/${po._id}/daily-status`, { token: tok.kitchen, body: { deliveryId: String(dd._id), status: 'ready' } });
    assert.equal(hijack.status, 404, 'another vendor cannot change the status');
    const asUser = await call('PATCH', `/v1/dmb/pantry-orders/${po._id}/daily-status`, { token: tok.user, body: { deliveryId: String(dd._id), status: 'ready' } });
    assert.equal(asUser.status, 403);
});

test('4. shop sees the bag, marks it ready; status values are validated and cannot skip the driver steps', async () => {
    const vend = await call('GET', `/v1/dmb/pantry-orders/vendor?date=${todayStr}`, { token: tok.shop });
    assert.equal(vend.body.orders.length, 1);
    const row = vend.body.orders[0];
    assert.equal(row.deliverySlot, SLOT);
    const po = await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] });
    const bad = await call('PATCH', `/v1/dmb/pantry-orders/${po._id}/daily-status`, { token: tok.shop, body: { deliveryId: String(row.deliveryId), status: 'delivered' } });
    assert.equal(bad.status, 400, 'the shop must not be able to mark a bag delivered');
    const junk = await call('PATCH', `/v1/dmb/pantry-orders/${po._id}/daily-status`, { token: tok.shop, body: { deliveryId: String(row.deliveryId), status: 'banana' } });
    assert.equal(junk.status, 400, 'an unknown status is refused');
    const ok = await call('PATCH', `/v1/dmb/pantry-orders/${po._id}/daily-status`, { token: tok.shop, body: { deliveryId: String(row.deliveryId), status: 'ready' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
});

test('5. kitchen A marks the meal ready: a pickup batch exists for A; the pantry shop B gets its own pickup batch with a PIN', async () => {
    const ready = await call('POST', '/v1/dmb/vendor/daily-orders/mark-all-ready', { token: tok.kitchen, body: { date: todayStr, slot: SLOT } });
    assert.equal(ready.status, 200, JSON.stringify(ready.body));
    const batchA = await M.CollectionBatch.findOne({ vendorId: w.vendor._id, deliverySlot: SLOT });
    assert.ok(batchA, 'kitchen batch');
    assert.equal(batchA.boxCount, 1);
    // The pantry shop has marked its bag ready: the drivers must be asked to collect it, with a PIN for the shop.
    const batchB = await M.CollectionBatch.findOne({ vendorId: shop._id, deliverySlot: SLOT });
    assert.ok(batchB, 'the pantry shop needs a pickup batch (PIN) once its bag is ready, otherwise no driver is ever asked to collect it');
    assert.equal(batchB.boxCount, 1);
});

test('6. one driver: route shows BOTH pickups and both drops; accepts both batches', async () => {
    const route = await call('GET', '/v1/dmb/driver/slot-route', { token: tok.driver });
    assert.equal(route.status, 200, JSON.stringify(route.body));
    const pickups = route.body.stops.filter((s) => s.type === 'pickup');
    const drops = route.body.stops.filter((s) => s.type === 'delivery');
    assert.deepEqual(pickups.map((p) => p.name).sort(), ['Corner Pantry', 'Maria Kitchen']);
    assert.equal(drops.length, 2);
    for (const batch of await M.CollectionBatch.find({ deliverySlot: SLOT, status: 'pending' })) {
        const acc = await call('POST', '/v1/dmb/driver/accept-batch', { token: tok.driver, body: { batchId: batch.batchId } });
        assert.equal(acc.status, 200, JSON.stringify(acc.body));
        const again = await call('POST', '/v1/dmb/driver/accept-batch', { token: tok.driver, body: { batchId: batch.batchId } });
        assert.equal(again.status, 400, 'a batch cannot be accepted twice');
    }
});

test('7. collection PINs: wrong PIN refused, three wrong attempts lock, right PIN collects; the pantry bag goes out for delivery', async () => {
    const batchB = await M.CollectionBatch.findOne({ vendorId: shop._id, deliverySlot: SLOT });
    assert.ok(batchB, 'pantry batch exists');
    const bad = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: '0000', vendorId: String(shop._id), slot: SLOT } });
    assert.equal(bad.status, 400);
    const ok = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: batchB.collectionPinHash, vendorId: String(shop._id), slot: SLOT } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const po = await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] }).lean();
    assert.equal(po.dailyDeliveries[0].status, 'out_for_delivery', 'bag is out for delivery after pickup');
    assert.equal(String(po.dailyDeliveries[0].driverId), String(driver._id), 'the driver is recorded on the bag (needed to report a failed delivery)');

    const batchA = await M.CollectionBatch.findOne({ vendorId: w.vendor._id, deliverySlot: SLOT });
    for (let i = 0; i < 3; i++) await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: '0000', vendorId: String(w.vendor._id), slot: SLOT } });
    const locked = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: batchA.collectionPinHash, vendorId: String(w.vendor._id), slot: SLOT } });
    assert.equal(locked.status, 423, 'locked after 3 wrong tries even with the right PIN');
    const regen = await call('POST', '/v1/dmb/vendor/daily-orders/regenerate-pin', { token: tok.kitchen, body: { batchId: batchA.batchId } });
    assert.equal(regen.status, 200);
    const ok2 = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: regen.body.otp, vendorId: String(w.vendor._id), slot: SLOT } });
    assert.equal(ok2.status, 200, JSON.stringify(ok2.body));
    assert.equal((await w.DMBDailyOrder.findById(mealOrder._id)).status, 'out_for_delivery');
});

test('8. delivery: the customer\'s two PINs; wrong PIN refused; bag + meal delivered; no double delivery; stranger driver refused', async () => {
    const route = await call('GET', '/v1/dmb/driver/slot-route', { token: tok.driver });
    const drops = route.body.stops.filter((s) => s.type === 'delivery');
    assert.equal(drops.length, 2);
    const bagId = (await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] })).dailyDeliveries[0]._id;
    const pantryDrop = drops.find((d) => d.id === `delivery_${bagId}`);
    const mealDrop = drops.find((d) => d.id === `delivery_${mealOrder._id}`);
    assert.ok(pantryDrop && mealDrop, 'a drop for the bag and a drop for the meal');
    assert.ok(pantryDrop.deliveryPin, 'the bag has its own delivery PIN, shown to the customer');

    // The customer can read the PIN for BOTH from the app.
    const mine = await call('GET', '/v1/dmb/pantry-orders/my-orders', { token: tok.user });
    const mineBag = mine.body.orders.find((o) => o.orderId === pantryOrderIds[0]);
    assert.ok(mineBag.dailyDeliveries[0].deliveryPin, 'the customer app can show the bag PIN');

    const otherDriver = await w.FoodDeliveryPartner.create({ name: 'Stranger', phone: nextPhone(), status: 'approved' });
    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    const strangerTok = signAccessToken({ userId: String(otherDriver._id), role: 'DELIVERY_PARTNER' });
    const stolen = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: strangerTok, body: { orderId: pantryDrop.orderId, pin: pantryDrop.deliveryPin } });
    assert.equal(stolen.status, 400, 'a driver who did not pick the bag up cannot deliver it');

    const wrong = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: tok.driver, body: { orderId: pantryDrop.orderId, pin: '0000' } });
    assert.equal(wrong.status, 400);
    const bag = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: tok.driver, body: { orderId: pantryDrop.orderId, pin: pantryDrop.deliveryPin, deliveryGps: { lat: WARSAW.lat, lng: WARSAW.lng } } });
    assert.equal(bag.status, 200, `bag delivery: ${JSON.stringify(bag.body)}`);
    const po = await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] }).lean();
    assert.equal(po.dailyDeliveries[0].status, 'delivered');
    assert.ok(po.dailyDeliveries[0].deliveredAt);
    const twice = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: tok.driver, body: { orderId: pantryDrop.orderId, pin: pantryDrop.deliveryPin } });
    assert.equal(twice.status, 400, 'delivering the same bag twice is refused');

    const meal = await call('POST', '/v1/dmb/driver/verify-delivery-pin', { token: tok.driver, body: { orderId: mealDrop.orderId, pin: mealDrop.deliveryPin } });
    assert.equal(meal.status, 200, JSON.stringify(meal.body));
    assert.equal((await w.DMBDailyOrder.findById(mealOrder._id)).status, 'delivered');
});

test('9. driver earnings: credited once per drop, for the bag as well as the meal', async () => {
    const po = await M.PantryOrder.findOne({ orderId: pantryOrderIds[0] }).lean();
    const before = (await w.FoodDeliveryPartner.findById(driver._id).lean()).earningsToday || 0;
    const bag = await call('POST', '/v1/dmb/driver/confirm-payment', { token: tok.driver, body: { orderId: String(po.dailyDeliveries[0]._id), method: 'QR' } });
    assert.equal(bag.status, 200, `a pantry drop must be payable: ${JSON.stringify(bag.body)}`);
    const meal = await call('POST', '/v1/dmb/driver/confirm-payment', { token: tok.driver, body: { orderId: String(mealOrder._id), method: 'QR' } });
    assert.equal(meal.status, 200, JSON.stringify(meal.body));
    const after = (await w.FoodDeliveryPartner.findById(driver._id).lean()).earningsToday || 0;
    assert.equal(after - before, 10, '2 drops x 5');
    const again = await call('POST', '/v1/dmb/driver/confirm-payment', { token: tok.driver, body: { orderId: String(po.dailyDeliveries[0]._id), method: 'QR' } });
    assert.equal(again.status, 400, 'no double earning');
});

test('10. failed delivery of a bag returns it to the shop for restocking', async () => {
    const res = await checkout({ groups: [{ items: [{ pantryItemId: String(bread._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: [SLOT] }] });
    await pay(res);
    const po = await M.PantryOrder.findOne({ orderId: res.body.orders[0].orderId });
    const dd = po.dailyDeliveries[0];
    await call('PATCH', `/v1/dmb/pantry-orders/${po._id}/daily-status`, { token: tok.shop, body: { deliveryId: String(dd._id), status: 'ready' } });
    const batchB = await M.CollectionBatch.findOne({ vendorId: shop._id, deliverySlot: SLOT, status: { $nin: ['collected', 'failed'] } });
    assert.ok(batchB, 'a fresh pickup for the second bag');
    // The shop can ask the drivers again for the same pickup (resend), pantry bags included.
    const resend = await call('POST', '/v1/dmb/vendor/daily-orders/resend-batch', { token: tok.shop, body: { date: todayStr, slot: SLOT } });
    assert.equal(resend.status, 200, `a pantry-only shop can resend its pickup request: ${JSON.stringify(resend.body)}`);
    const rb = await M.CollectionBatch.findOne({ _id: batchB._id }).lean();
    assert.equal(rb.boxCount, 1);
    assert.equal(String(rb.orderIds[0]), String(dd._id));
    const upcoming = await call('GET', '/v1/dmb/pantry-orders/my-orders?type=upcoming', { token: tok.user });
    assert.ok(upcoming.body.orders.some((o) => o.orderId === po.orderId), 'the bag due today is in the customer upcoming list (platform day)');
    const { reportFailedDelivery } = await import('../src/modules/dailymealbox/tracking/failedDelivery.service.js');
    await M.PantryOrder.updateOne({ _id: po._id, 'dailyDeliveries._id': dd._id }, { $set: { 'dailyDeliveries.$.driverId': driver._id, 'dailyDeliveries.$.status': 'out_for_delivery' } });
    const r = await reportFailedDelivery({ driverId: driver._id, stopType: 'pantry', id: dd._id, reason: 'no_one_home', disposition: 'returned_to_shop', photoUrl: 'https://x.test/p.jpg' });
    assert.equal(r.returnStatus, 'returned_to_shop');
    const list = await call('GET', '/v1/dmb/vendor/pantry-returns', { token: tok.shop });
    assert.equal(list.status, 200, JSON.stringify(list.body));
    await call('PATCH', `/v1/dmb/vendor/pantry-returns/${dd._id}/restock`, { token: tok.shop });
    assert.equal((await M.PantryOrder.findOne({ _id: po._id })).dailyDeliveries[0].returnStatus, 'restocked');
});

test('11. the same customer: a kitchen meal and a pantry bag in the SAME slot, one driver takes both pickups on one route; slot timing; request queue data', async () => {
    // Fresh state: a meal for today (kitchen A) and a lunch bag (shop B) for the same customer.
    await M.CollectionBatch.deleteMany({});
    await w.DMBDailyOrder.updateOne({ _id: mealOrder._id }, { $set: { status: 'scheduled', 'dispatch.deliveryPartnerId': null } });
    await w.FoodDeliveryPartner.updateOne({ _id: driver._id }, { $set: { assignedVendors: [w.vendor._id] } }); // the shop is NOT on the driver's usual list
    const res = await checkout({ groups: [{ items: [{ pantryItemId: String(milk._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: [SLOT] }, { items: [{ pantryItemId: String(bread._id), quantity: 1 }], deliveryDates: [todayStr], deliverySlots: ['dinner'] }] });
    await pay(res);
    const lunchOrder = res.body.orders.find((o) => o.deliverySlots[0] === SLOT);
    const dinnerOrder = res.body.orders.find((o) => o.deliverySlots[0] === 'dinner');
    const lunchBag = (await M.PantryOrder.findOne({ orderId: lunchOrder.orderId })).dailyDeliveries[0];
    const dinnerBag = (await M.PantryOrder.findOne({ orderId: dinnerOrder.orderId })).dailyDeliveries[0];

    // Marking the dinner bag ready during the lunch window is refused (same rule as meals)...
    await M.DeliverySlot.updateOne({ key: 'dinner' }, { $set: { startTime: '03:00', endTime: '03:01' } });
    const { listSlots } = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    await listSlots();
    const early = await call('PATCH', `/v1/dmb/pantry-orders/${dinnerOrder._id}/daily-status`, { token: tok.shop, body: { deliveryId: String(dinnerBag._id), status: 'ready' } });
    assert.equal(early.status, 409, JSON.stringify(early.body));
    assert.equal(early.body.code, 'OUTSIDE_SLOT_WINDOW');
    assert.equal(await M.CollectionBatch.countDocuments({ vendorId: shop._id, deliverySlot: 'dinner' }), 0, 'no dinner request reached any driver');

    // ...while lunch is fine, and only the lunch request exists.
    const ok = await call('PATCH', `/v1/dmb/pantry-orders/${lunchOrder._id}/daily-status`, { token: tok.shop, body: { deliveryId: String(lunchBag._id), status: 'ready' } });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    await call('POST', '/v1/dmb/vendor/daily-orders/mark-all-ready', { token: tok.kitchen, body: { date: todayStr, slot: SLOT } });
    const batches = await M.CollectionBatch.find({ deliverySlot: SLOT, status: 'pending' });
    assert.equal(batches.length, 2, 'one pickup request per vendor: the kitchen and the pantry shop');

    // One driver accepts both (while it already holds nothing else) and sees BOTH pickups, then both drops, on ONE route.
    for (const b of batches) assert.equal((await call('POST', '/v1/dmb/driver/accept-batch', { token: tok.driver, body: { batchId: b.batchId } })).status, 200);
    const route = await call('GET', '/v1/dmb/driver/my-route', { token: tok.driver });
    assert.equal(route.status, 200, JSON.stringify(route.body));
    const pickups = route.body.stops.filter((s) => s.type === 'P');
    const drops = route.body.stops.filter((s) => s.type === 'D');
    assert.deepEqual(pickups.map((p) => p.name).sort(), ['Corner Pantry', 'Maria Kitchen'], 'both vendors are pickup stops');
    assert.equal(drops.length, 2, 'the meal and the bag are both drops for the same customer');
    assert.ok(drops.every((d) => d.slot === SLOT), 'the bag stop carries its slot');
    assert.equal(route.body.vendorName, 'Maria Kitchen + Corner Pantry'.split(' + ').sort((a, b) => route.body.vendorName.indexOf(a) - route.body.vendorName.indexOf(b)).join(' + '));
    assert.equal(route.body.totalMealBoxCount, 2);
    // The shop is not on the driver's usual list, yet its stop shows on the today-route once its pickup is accepted.
    const slotRoute = await call('GET', '/v1/dmb/driver/slot-route', { token: tok.driver });
    assert.ok(slotRoute.body.stops.some((s) => s.type === 'pickup' && s.name === 'Corner Pantry'), 'accepted vendor shows even if not on the usual list');

    // Collect from the kitchen only: its drop opens, the shop's drop stays locked until the shop is collected too.
    const kitchenBatch = batches.find((b) => String(b.vendorId) === String(w.vendor._id));
    const pantryBatch = batches.find((b) => String(b.vendorId) === String(shop._id));
    const k = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: (await M.CollectionBatch.findById(kitchenBatch._id)).collectionPinHash, vendorId: String(w.vendor._id), slot: SLOT } });
    assert.equal(k.status, 200, JSON.stringify(k.body));
    let r2 = await call('GET', '/v1/dmb/driver/my-route', { token: tok.driver });
    assert.equal(r2.body.stops.filter((s) => s.type === 'P').length, 1, 'only the pantry pickup is left');
    const mealStop = r2.body.stops.find((s) => s.type === 'D' && String(s.orderId) === String(mealOrder._id));
    const bagStop = r2.body.stops.find((s) => s.type === 'D' && String(s.orderId) === String(lunchBag._id));
    assert.equal(mealStop.status, 'READY');
    assert.equal(bagStop.status, 'WAITING');
    const p = await call('POST', '/v1/dmb/driver/verify-collection-pin', { token: tok.driver, body: { pin: (await M.CollectionBatch.findById(pantryBatch._id)).collectionPinHash, vendorId: String(shop._id), slot: SLOT } });
    assert.equal(p.status, 200, JSON.stringify(p.body));
    r2 = await call('GET', '/v1/dmb/driver/my-route', { token: tok.driver });
    assert.equal(r2.body.stops.filter((s) => s.type === 'P').length, 0);
    assert.equal(r2.body.stops.filter((s) => s.type === 'D' && s.status !== 'COMPLETED').length, 2);
});
