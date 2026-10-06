/**
 * Office (B2B) flow, end to end over the real HTTP routes:
 *   company adds employees → buys a meal subscription for them (server-priced, test payment) → every employee gets
 *   their own subscription delivered to the office's map pin → the vendor sees the orders at once → the vendor marks
 *   them ready and a pickup batch is made → the employees sign in to the customer app and see their meals (skipping one
 *   credits nothing to their own wallet; cancelling or changing a company plan is refused) → the office buys a second
 *   subscription for the same employee (other slot, other vendor, next period) but not an overlapping one → the office
 *   cancels one assignment and removes an employee.
 *
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/officeFlow.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import mongoose from 'mongoose';

process.env.PAYMENTS_MODE = 'mock';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret';

const { connect, disconnect, seedWorld, setControl, WARSAW, OUTSIDE } = await import('./helpers/amendmentFixtures.mjs');

let w, server, base, time, officeToken, vendorToken, vendor2Token, company, account;
const M = {};

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
    await connect('office_flow_test');
    w = await seedWorld();
    time = await import('../src/utils/platformTime.js');
    const { listSlots } = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.service.js');
    await listSlots();
    await setControl('weekendDelivery', { saturday: true, sunday: true });
    await setControl('maxSlotsPerDay', { value: 3 });

    Object.assign(M, {
        OfficeAccount: (await import('../src/modules/dailymealbox/office/models/officeAccount.model.js')).OfficeAccount,
        OfficeCompany: (await import('../src/modules/dailymealbox/office/models/officeCompany.model.js')).OfficeCompany,
        OfficeEmployee: (await import('../src/modules/dailymealbox/office/models/officeEmployee.model.js')).OfficeEmployee,
        OfficeMealAssignment: (await import('../src/modules/dailymealbox/office/models/officeMealAssignment.model.js')).OfficeMealAssignment,
        OfficePayment: (await import('../src/modules/dailymealbox/office/models/officePayment.model.js')).OfficePayment,
        CollectionBatch: (await import('../src/modules/dailymealbox/delivery/collectionBatch.model.js')).CollectionBatch,
        VendorTimingSettings: (await import('../src/modules/food/admin/models/vendorTimingSettings.model.js')).VendorTimingSettings
    });
    // Kitchens may mark orders ready at any hour in this test.
    await M.VendorTimingSettings.create({ isActive: true, bypassPrepTimingRestrictions: true });

    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    account = await M.OfficeAccount.create({ email: 'hr@acme.example', password: 'Secret123!' });
    company = await M.OfficeCompany.create({
        accountId: account._id, legalName: 'ACME Sp. z o.o.', nip: '5250000000', registeredAddress: 'Prosta 20, 00-850 Warszawa',
        deliveryAddress: 'Prosta 20, 00-850 Warszawa', location: { lat: WARSAW.lat + 0.01, lng: WARSAW.lng + 0.01 },
        contactName: 'Hanna', contactRole: 'HR', contactEmail: 'hr@acme.example', contactPhone: '+48500500500', status: 'approved'
    });
    officeToken = signAccessToken({ accountId: String(account._id), role: 'OFFICE_ADMIN' });
    vendorToken = signAccessToken({ userId: String(w.vendor._id), role: 'RESTAURANT' });
    vendor2Token = signAccessToken({ userId: String(w.vendor2._id), role: 'RESTAURANT' });

    const app = express();
    app.use(express.json());
    app.use('/v1/food/auth', (await import('../src/core/auth/auth.routes.js')).default);
    app.use('/v1/dmb/office', (await import('../src/modules/dailymealbox/office/routes/office.routes.js')).default);
    app.use('/v1/dmb/subscriptions', (await import('../src/modules/dailymealbox/subscription/subscription.routes.js')).default);
    app.use('/v1/dmb/vendor', (await import('../src/modules/dailymealbox/vendor/vendor.routes.js')).default);
    app.use('/v1/dmb/payments', (await import('../src/modules/dailymealbox/payment/dmb.payment.routes.js')).default);
    app.use('/v1/payments', (await import('../src/modules/payments/payments.routes.js')).paymentsRouter);
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

const employees = {};

/** Quote → create order (with the quoted total) → test payment. Returns the OfficePayment after it is confirmed. */
const buy = async ({ employeeIds, vendorId = w.vendor._id, mealPlanId = w.meal._id, planId = w.plans.weekFull._id, slots = ['lunch'], startDate }) => {
    const order = { employeeIds: employeeIds.map(String), vendorId: String(vendorId), mealPlanId: String(mealPlanId), subscriptionPlanId: String(planId), slots, startDate };
    const quote = await call('POST', '/v1/dmb/office/assignments/quote', { token: officeToken, body: order });
    assert.equal(quote.status, 200, JSON.stringify(quote.body));
    const created = await call('POST', '/v1/dmb/office/assignments/create-order', { token: officeToken, body: { ...order, expectedTotal: quote.data.total, provider: 'mock' } });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.data.payment.provider, 'mock');
    const paid = await call('POST', `/v1/payments/${created.data.payment.transactionId}/mock-confirm`, { token: officeToken });
    assert.equal(paid.status, 200, JSON.stringify(paid.body));
    assert.equal(paid.body.fulfilled, true, 'the meals are assigned as part of the payment confirmation');
    return { quote: quote.data, payment: await M.OfficePayment.findById(created.data.officePaymentId).lean() };
};

test('employees: phone is stored as the app signs in (48…), existing customers are linked, bad input is refused', async () => {
    // A customer who already uses the app with this number becomes the employee (same account, same login). This one was
    // saved by an older screen with a "+": it is linked and stored the way the app signs in.
    const existing = await w.FoodUser.create({ phone: '+48600100201', name: 'Ola Existing', role: 'USER' });

    const anna = await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'Anna Nowak', email: 'Anna@acme.example', phone: '600 100 200', department: 'Engineering', status: 'Active' } });
    assert.equal(anna.status, 201, JSON.stringify(anna.body));
    assert.equal(anna.data.phone, '48600100200');
    assert.equal(anna.data.email, 'anna@acme.example');
    assert.match(anna.data.employeeId, /^EMP-[0-9A-F]{8}$/);
    const annaUser = await w.FoodUser.findById(anna.data.userId).lean();
    assert.equal(annaUser.phone, '48600100200');
    assert.equal(annaUser.role, 'EMPLOYEE');
    assert.equal(String(annaUser.companyId), String(company._id));

    const ola = await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'Ola K', email: 'ola@acme.example', phone: '600100201', department: 'Design', status: 'Active' } });
    assert.equal(ola.status, 201, JSON.stringify(ola.body));
    assert.equal(String(ola.data.userId), String(existing._id), 'linked to the existing account, not a new one');
    assert.equal((await w.FoodUser.findById(existing._id).lean()).phone, '48600100201');

    const piotr = await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'Piotr W', email: 'piotr@acme.example', phone: '+48 600-100-202', department: 'Finance', status: 'Active' } });
    assert.equal(piotr.status, 201, JSON.stringify(piotr.body));
    assert.equal(piotr.data.phone, '48600100202');

    // Server-owned fields cannot be injected.
    const sneaky = await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'X', email: 'x@acme.example', phone: '600100299', userId: String(existing._id), accountId: String(new mongoose.Types.ObjectId()) } });
    assert.equal(sneaky.status, 201);
    assert.notEqual(String(sneaky.data.userId), String(existing._id));
    assert.equal(String(sneaky.data.accountId), String(account._id));
    await call('DELETE', `/v1/dmb/office/employees/${sneaky.data._id}`, { token: officeToken });

    assert.equal((await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'Dup', email: 'anna@acme.example', phone: '600100203' } })).status, 409, 'duplicate email');
    assert.equal((await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'Dup', email: 'dup@acme.example', phone: '600100200' } })).status, 409, 'number already used by another employee');
    assert.equal((await call('POST', '/v1/dmb/office/employees', { token: officeToken, body: { name: 'Bad', email: 'bad@acme.example', phone: '12345' } })).status, 400, 'not a phone number');

    // Customers, vendors and drivers cannot use the office API.
    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    assert.equal((await call('GET', '/v1/dmb/office/employees', { token: signAccessToken({ userId: String(existing._id), role: 'USER' }) })).status, 403);

    employees.anna = anna.data;
    employees.ola = ola.data;
    employees.piotr = piotr.data;
});

test('the office cannot approve itself or move its account through "update company"', async () => {
    await M.OfficeCompany.updateOne({ _id: company._id }, { $set: { status: 'under_review' } });
    const res = await call('PUT', '/v1/dmb/office/company', { token: officeToken, body: { status: 'approved', accountId: String(new mongoose.Types.ObjectId()), contactName: 'Hanna K' } });
    assert.equal(res.status, 200);
    const after = await M.OfficeCompany.findById(company._id).lean();
    assert.equal(after.status, 'under_review');
    assert.equal(String(after.accountId), String(account._id));
    assert.equal(after.contactName, 'Hanna K');
    await M.OfficeCompany.updateOne({ _id: company._id }, { $set: { status: 'approved' } });
});

test('vendors offered to the office are those delivering to its map pin, each with its meals', async () => {
    const res = await call('GET', '/v1/dmb/office/vendors', { token: officeToken });
    assert.equal(res.status, 200);
    assert.equal(res.data.delivery.status, 'ok');
    const names = res.data.vendors.map((v) => v.restaurantName).sort();
    assert.deepEqual(names, ['Bistro Centrum', 'Maria Kitchen'], 'South Diner does not deliver to the office zone');
    const maria = res.data.vendors.find((v) => v.restaurantName === 'Maria Kitchen');
    assert.deepEqual(maria.mealPlans.map((m) => m.name).sort(), ['Pierogi', 'Rosół']);
});

test('purchase: priced on the server for every slot and delivery day, one subscription per employee at the office pin', async () => {
    // A leftover admin "price" on the plan is never read: the food price is the vendor's own meal price.
    await w.VendorSubscriptionPlan.updateOne({ _id: w.plans.weekFull._id }, { $set: { price: 99999 } });
    const { quote, payment } = await buy({ employeeIds: [employees.anna._id, employees.ola._id], slots: ['lunch', 'dinner'] });
    // Weekly, full week: 7 days × 2 slots = 14 deliveries per employee. Meal 20, delivery 5, VAT 8% / 23%.
    assert.equal(quote.perEmployee.deliveries, 14);
    assert.equal(quote.perEmployee.food, 280);
    assert.equal(quote.perEmployee.foodVat, 22.4);
    assert.equal(quote.perEmployee.delivery, 70);
    assert.equal(quote.perEmployee.deliveryVat, 16.1);
    assert.equal(quote.perEmployee.total, 388.5);
    assert.equal(quote.total, 777);
    assert.equal(quote.currency, 'PLN');
    assert.equal(payment.amount, 777);
    assert.equal(payment.status, 'paid');
    assert.ok(payment.fulfilledAt);

    const subs = await w.DMBSubscription.find({ officePaymentId: payment._id }).lean();
    assert.equal(subs.length, 2);
    for (const sub of subs) {
        assert.equal(sub.status, 'active');
        assert.equal(sub.source, 'office');
        assert.equal(sub.invoiceType, 'b2b_vat');
        assert.equal(String(sub.companyId), String(company._id));
        assert.equal(String(sub.zoneId), String(w.zone._id));
        assert.deepEqual(sub.deliverySlots, ['lunch', 'dinner']);
        assert.equal(sub.pricing.totalPrice, 388.5);
        assert.deepEqual(sub.deliveryAddress.location.coordinates, [WARSAW.lng + 0.01, WARSAW.lat + 0.01], 'drivers navigate to the office pin');
        assert.equal(sub.deliveryAddress.label, 'Office');
        assert.equal(time.storageDateStr(sub.startDate), quote.startDate);
        assert.equal(time.storageDateStr(sub.endDate), quote.endDate);
    }
    const assignments = await M.OfficeMealAssignment.find({ officePaymentId: payment._id }).lean();
    assert.equal(assignments.length, 2);
    assert.ok(assignments.every((a) => a.subscriptionId && a.status === 'active'));
});

test('the vendor sees the office orders immediately (no hourly job), labelled with the company, priced as paid', async () => {
    const tomorrow = time.storageDateStr(time.addDays(time.localToday(), 1));
    const res = await call('GET', `/v1/dmb/vendor/daily-orders?date=${tomorrow}`, { token: vendorToken });
    assert.equal(res.status, 200);
    const office = res.body.orders.filter((o) => o.office);
    assert.equal(office.length, 4, '2 employees × lunch + dinner');
    assert.ok(office.every((o) => o.office.companyName === 'ACME Sp. z o.o.'));
    assert.deepEqual([...new Set(office.map((o) => o.customer.name))].sort(), ['Anna Nowak', 'Ola Existing']);
    // One delivery: meal 20 + 8% VAT, delivery 5 + 23% VAT.
    assert.ok(office.every((o) => o.pricing.totalPrice === 27.75), JSON.stringify(office.map((o) => o.pricing)));

    const subscribers = await call('GET', '/v1/dmb/vendor/subscribers', { token: vendorToken });
    assert.equal(subscribers.body.subscribers.filter((s) => s.source === 'office').length, 2);
});

test('delivery: the orders carry the office pin and zone; marking them ready makes a pickup batch for drivers', async () => {
    const tomorrow = time.addDays(time.localToday(), 1);
    const orders = await w.DMBDailyOrder.find({ vendorId: w.vendor._id, deliveryDate: tomorrow, deliverySlot: 'lunch' }).lean();
    assert.equal(orders.length, 2);
    for (const o of orders) {
        assert.deepEqual(o.deliveryAddress.location.coordinates, [WARSAW.lng + 0.01, WARSAW.lat + 0.01]);
        assert.equal(String(o.zoneId), String(w.zone._id));
    }
    const ready = await call('POST', '/v1/dmb/vendor/daily-orders/mark-all-ready', { token: vendorToken, body: { date: time.storageDateStr(tomorrow), slot: 'lunch' } });
    assert.equal(ready.status, 200, JSON.stringify(ready.body));
    const batch = await M.CollectionBatch.findOne({ vendorId: w.vendor._id, deliveryDate: tomorrow, deliverySlot: 'lunch' }).lean();
    assert.ok(batch, 'a collection batch (pickup PIN) exists for the drivers');
    assert.equal(batch.boxCount, 2);
});

test('employee app: signing in with the number the office entered shows the company-paid meals', async () => {
    // Exactly what the customer app sends: country code + number, digits only.
    const otpRes = await call('POST', '/v1/food/auth/user/request-otp', { body: { phone: '48600100200' } });
    assert.equal(otpRes.status, 200, JSON.stringify(otpRes.body));
    const login = await call('POST', '/v1/food/auth/user/verify-otp', { body: { phone: '48600100200', otp: otpRes.data.otp } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.equal(String(login.data.user.id), String(employees.anna.userId), 'the same account the office linked, not a new empty one');
    assert.equal(login.data.user.role, 'EMPLOYEE');
    employees.anna.token = login.data.accessToken;

    const mine = await call('GET', '/v1/dmb/subscriptions/my', { token: employees.anna.token });
    assert.equal(mine.body.subscriptions.length, 1);
    assert.equal(mine.body.subscriptions[0].source, 'office');
    assert.equal(mine.body.subscriptions[0].companyName, 'ACME Sp. z o.o.');

    const upcoming = await call('GET', '/v1/dmb/subscriptions/my-orders?type=upcoming', { token: employees.anna.token });
    assert.equal(upcoming.status, 200);
    assert.ok(upcoming.body.orders.length >= 4, `orders: ${upcoming.body.orders.length}`);
    assert.ok(upcoming.body.orders.every((o) => o.paidBy?.companyName === 'ACME Sp. z o.o.'));

    const home = await call('GET', '/v1/dmb/subscriptions/today', { token: employees.anna.token });
    assert.equal(home.status, 200);
    assert.ok(home.body.tomorrow, 'tomorrow\'s meal card');
    assert.equal(home.body.tomorrow.paidBy.companyName, 'ACME Sp. z o.o.');
});

test('employee app: skipping a company meal credits nothing; cancelling, changing or redirecting a company plan is refused', async () => {
    const token = employees.anna.token;
    const user = await w.FoodUser.findById(employees.anna.userId).lean();
    const in3 = time.addDays(time.localToday(), 3);
    const order = await w.DMBDailyOrder.findOne({ userId: user._id, deliveryDate: in3, deliverySlot: 'lunch' }).lean();
    assert.ok(order, 'the 10-day calendar generated later orders');
    const skip = await call('PATCH', `/v1/dmb/subscriptions/daily-orders/${order._id}/skip`, { token });
    assert.equal(skip.status, 200, JSON.stringify(skip.body));
    assert.equal(skip.body.creditAmount, 0);
    assert.equal((await w.FoodUser.findById(user._id).lean()).walletBalance || 0, 0, 'company money never reaches the employee wallet');
    const undo = await call('PATCH', `/v1/dmb/subscriptions/daily-orders/${order._id}/undo-skip`, { token });
    assert.equal(undo.status, 200);
    assert.equal((await w.FoodUser.findById(user._id).lean()).walletBalance || 0, 0);

    const sub = await w.DMBSubscription.findOne({ userId: user._id, source: 'office' }).lean();
    const cancel = await call('PATCH', `/v1/dmb/subscriptions/${sub.subscriptionId}/cancel`, { token, body: { reason: 'x' } });
    assert.equal(cancel.status, 400);
    assert.match(cancel.body.message, /paid by your company/);
    assert.equal((await w.DMBSubscription.findById(sub._id).lean()).status, 'active');

    const change = await call('POST', '/v1/dmb/payments/change/preview', { token, body: { subscriptionId: String(sub._id), type: 'switch_vendor', input: { vendorId: String(w.vendor2._id), meals: [{ mealPlanId: String(w.bistroMeal._id), quantity: 1 }] } } });
    assert.equal(change.status, 403, JSON.stringify(change.body));
    assert.match(change.body.message, /paid by your company/);

    const { DMBSubscription } = w;
    const address = await call('PATCH', `/v1/dmb/subscriptions/${sub._id}/address`, { token, body: { addressId: String(new mongoose.Types.ObjectId()) } });
    assert.equal(address.status, 403, JSON.stringify(address.body));
    assert.equal(String((await DMBSubscription.findById(sub._id).lean()).deliveryAddress.label), 'Office');

    // Pausing is fine: the days move to the end, no money moves.
    const pause = await call('PATCH', `/v1/dmb/subscriptions/${sub.subscriptionId}/pause`, { token, body: { pauseDays: 1 } });
    assert.equal(pause.status, 200, JSON.stringify(pause.body));
    const resume = await call('PATCH', `/v1/dmb/subscriptions/${sub.subscriptionId}/resume`, { token });
    assert.equal(resume.status, 200, JSON.stringify(resume.body));
});

test('multiple subscriptions: another slot or vendor is added alongside; an overlapping slot is refused; the next period can be bought early', async () => {
    // Breakfast from a second vendor, for Anna only — her lunch/dinner plan stays active.
    await w.FoodRestaurant.updateOne({ _id: w.vendor2._id }, { $set: { deliveryWeekdays: [0, 1, 2, 3, 4, 5, 6] } });
    const { payment: second } = await buy({ employeeIds: [employees.anna._id], vendorId: w.vendor2._id, mealPlanId: w.bistroMeal._id, slots: ['breakfast'] });
    const annaSubs = await w.DMBSubscription.find({ userId: employees.anna.userId, source: 'office', status: 'active' }).lean();
    assert.equal(annaSubs.length, 2, 'the first plan was not cancelled by the second purchase');
    assert.equal((await M.OfficeMealAssignment.countDocuments({ employeeId: employees.anna._id, status: 'active' })), 2);
    assert.ok(second.fulfilledAt);

    // The second vendor sees its own office order.
    const tomorrow = time.storageDateStr(time.addDays(time.localToday(), 1));
    const v2 = await call('GET', `/v1/dmb/vendor/daily-orders?date=${tomorrow}`, { token: vendor2Token });
    assert.equal(v2.body.orders.filter((o) => o.office && o.deliverySlot === 'breakfast').length, 1);

    // Lunch again for Anna in the same week: refused before any payment, with who/until.
    const order = { employeeIds: [String(employees.anna._id), String(employees.piotr._id)], vendorId: String(w.vendor._id), mealPlanId: String(w.meal2._id), subscriptionPlanId: String(w.plans.weekFull._id), slots: ['lunch'] };
    const q = await call('POST', '/v1/dmb/office/assignments/quote', { token: officeToken, body: order });
    assert.equal(q.status, 200);
    assert.equal(q.data.conflicts.length, 1);
    assert.equal(q.data.conflicts[0].name, 'Anna Nowak');
    const refused = await call('POST', '/v1/dmb/office/assignments/create-order', { token: officeToken, body: { ...order, expectedTotal: q.data.total, provider: 'mock' } });
    assert.equal(refused.status, 409);
    assert.equal(refused.body.code, 'SLOT_TAKEN');
    assert.equal(await M.OfficePayment.countDocuments({ status: 'pending' }), 0, 'no payment was started');

    // ...but the next week's lunch, starting when the current one ends, is fine (renewal bought early).
    const first = annaSubs.find((s) => s.deliverySlots.includes('lunch'));
    const { quote } = await buy({ employeeIds: [employees.anna._id], startDate: time.storageDateStr(first.endDate) });
    assert.equal(quote.startDate, time.storageDateStr(first.endDate));
    assert.equal(await w.DMBSubscription.countDocuments({ userId: employees.anna.userId, source: 'office', status: 'active' }), 3);
});

test('a price the office did not see is never charged', async () => {
    const order = { employeeIds: [String(employees.piotr._id)], vendorId: String(w.vendor._id), mealPlanId: String(w.meal._id), subscriptionPlanId: String(w.plans.weekFull._id), slots: ['lunch'], provider: 'mock' };
    const res = await call('POST', '/v1/dmb/office/assignments/create-order', { token: officeToken, body: { ...order, expectedTotal: 1 } });
    assert.equal(res.status, 409);
    assert.equal(res.body.code, 'PRICE_CHANGED');
    const noTotal = await call('POST', '/v1/dmb/office/assignments/create-order', { token: officeToken, body: order });
    assert.equal(noTotal.status, 409);
});

test('the office needs its map pin, and only vendors delivering there can be bought', async () => {
    await M.OfficeCompany.updateOne({ _id: company._id }, { $unset: { location: 1 } });
    const order = { employeeIds: [String(employees.piotr._id)], vendorId: String(w.vendor._id), mealPlanId: String(w.meal._id), subscriptionPlanId: String(w.plans.weekFull._id), slots: ['lunch'] };
    const noPin = await call('POST', '/v1/dmb/office/assignments/quote', { token: officeToken, body: order });
    assert.equal(noPin.status, 400);
    assert.equal(noPin.body.code, 'OFFICE_LOCATION_REQUIRED');

    await M.OfficeCompany.updateOne({ _id: company._id }, { $set: { location: { lat: OUTSIDE.lat, lng: OUTSIDE.lng } } });
    assert.equal((await call('POST', '/v1/dmb/office/assignments/quote', { token: officeToken, body: order })).body.code, 'OFFICE_OUTSIDE_ZONE');

    await M.OfficeCompany.updateOne({ _id: company._id }, { $set: { location: { lat: WARSAW.lat + 0.01, lng: WARSAW.lng + 0.01 } } });
    const far = await call('POST', '/v1/dmb/office/assignments/quote', { token: officeToken, body: { ...order, vendorId: String(w.farVendor._id), mealPlanId: String(w.farMeal._id) } });
    assert.equal(far.status, 400);
    assert.equal(far.body.code, 'ZONE_MISMATCH');
});

test('a confirmation that runs twice at once creates each employee\'s subscription once', async () => {
    const order = { employeeIds: [String(employees.piotr._id)], vendorId: String(w.vendor._id), mealPlanId: String(w.meal._id), subscriptionPlanId: String(w.plans.weekFull._id), slots: ['dinner'] };
    const quote = await call('POST', '/v1/dmb/office/assignments/quote', { token: officeToken, body: order });
    const created = await call('POST', '/v1/dmb/office/assignments/create-order', { token: officeToken, body: { ...order, expectedTotal: quote.data.total, provider: 'mock' } });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    const { PaymentTransaction } = await import('../src/modules/payments/payments.models.js');
    await PaymentTransaction.updateOne({ publicId: created.data.payment.transactionId }, { $set: { status: 'paid', paidAt: new Date() } });
    const { fulfilOfficePayment } = await import('../src/modules/dailymealbox/office/office.assignment.service.js');
    const results = await Promise.allSettled([
        fulfilOfficePayment(created.data.officePaymentId),
        fulfilOfficePayment(created.data.officePaymentId),
        call('POST', '/v1/dmb/office/assignments', { token: officeToken, body: { transactionId: created.data.payment.transactionId } })
    ]);
    assert.ok(results.some((r) => r.status === 'fulfilled'));
    await fulfilOfficePayment(created.data.officePaymentId).catch(() => {});
    assert.equal(await w.DMBSubscription.countDocuments({ officePaymentId: created.data.officePaymentId }), 1);
    assert.equal(await M.OfficeMealAssignment.countDocuments({ officePaymentId: created.data.officePaymentId }), 1);
});

test('assignments list: every subscription with where it stands; cancelling one stops its later deliveries only', async () => {
    const list = await call('GET', '/v1/dmb/office/assignments', { token: officeToken });
    assert.equal(list.status, 200);
    const annas = list.data.filter((a) => a.employeeId.name === 'Anna Nowak');
    assert.equal(annas.length, 3);
    assert.ok(annas.some((a) => a.state === 'upcoming'), 'next week\'s plan');
    const breakfast = annas.find((a) => a.slots.includes('breakfast'));
    assert.ok(['active', 'upcoming'].includes(breakfast.state));

    const employeesRes = await call('GET', '/v1/dmb/office/employees?limit=100', { token: officeToken });
    const annaRow = employeesRes.data.employees.find((e) => e.name === 'Anna Nowak');
    assert.equal(annaRow.plans.length, 3);

    const cancel = await call('DELETE', `/v1/dmb/office/assignments/${breakfast._id}`, { token: officeToken });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
    const sub = await w.DMBSubscription.findById(breakfast.subscriptionId._id).lean();
    assert.equal(sub.status, 'cancelled');
    const later = await w.DMBDailyOrder.countDocuments({ subscriptionId: sub._id, deliveryDate: { $gte: time.addDays(time.localToday(), 1) }, status: 'scheduled' });
    assert.equal(later, 0, 'no more breakfasts from tomorrow');
    assert.equal(await w.DMBSubscription.countDocuments({ userId: employees.anna.userId, source: 'office', status: 'active' }), 2, 'her other plans continue');
    const again = await call('GET', '/v1/dmb/office/assignments', { token: officeToken });
    assert.equal(again.data.find((a) => String(a._id) === String(breakfast._id)).state, 'cancelled');
});

test('removing an employee cancels their company meals and gives them back an ordinary account', async () => {
    const res = await call('DELETE', `/v1/dmb/office/employees/${employees.ola._id}`, { token: officeToken });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.data.cancelledSubscriptions, 1);
    assert.equal(await w.DMBSubscription.countDocuments({ userId: employees.ola.userId, source: 'office', status: 'active' }), 0);
    const user = await w.FoodUser.findById(employees.ola.userId).lean();
    assert.equal(user.role, 'USER');
    assert.equal(user.companyId, null);
    assert.equal(await w.DMBDailyOrder.countDocuments({ userId: user._id, deliveryDate: { $gte: time.addDays(time.localToday(), 1) }, status: 'scheduled' }), 0);
});

test('a new phone number moves the employee\'s meals to that sign-in and never rewrites another account\'s number', async () => {
    const other = await w.FoodUser.create({ phone: '48600100777', name: 'Someone Else', role: 'USER' });
    const res = await call('PUT', `/v1/dmb/office/employees/${employees.piotr._id}`, { token: officeToken, body: { phone: '600100777' } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(String(res.data.userId), String(other._id));
    assert.equal((await w.FoodUser.findById(employees.piotr.userId).lean()).phone, '48600100202', 'the old account keeps its own number');
    assert.equal(await w.DMBSubscription.countDocuments({ userId: other._id, source: 'office', status: 'active' }), 1, 'Piotr\'s dinner plan follows him');
    assert.equal(await w.DMBSubscription.countDocuments({ userId: employees.piotr.userId, source: 'office', status: 'active' }), 0);
});
