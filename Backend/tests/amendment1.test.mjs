/**
 * Amendment 1 checks: credit notes (#12), special instructions (#7) and cancellation at the end of the paid period (#4).
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017); it creates and drops a throw-away database.
 *
 *   node --test tests/amendment1.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

const BASE_URI = process.env.PAYMENTS_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) throw new Error('Refusing to run against a non-local MongoDB');
const DB_NAME = `amendment1_test_${Date.now()}`;

let creditNotes;
let DMBSubscription;
let FoodUser;
let subs;
let specials;
let gdpr;
let DMBDailyOrder;

before(async () => {
    await mongoose.connect(`${BASE_URI.replace(/\/$/, '')}/${DB_NAME}`);
    creditNotes = await import('../src/modules/dailymealbox/billing/creditNote.service.js');
    ({ DMBSubscription } = await import('../src/modules/dailymealbox/subscription/subscription.model.js'));
    ({ FoodUser } = await import('../src/core/users/user.model.js'));
    subs = await import('../src/modules/dailymealbox/subscription/subscription.service.js');
    specials = await import('../src/modules/dailymealbox/mealplan/specialInstructions.js');
    gdpr = await import('../src/modules/dailymealbox/gdpr/gdpr.service.js');
    ({ DMBDailyOrder } = await import('../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js'));
});

after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

const makeUser = () => FoodUser.create({ name: 'Anna Test', phone: `+48${Math.floor(500000000 + Math.random() * 99999999)}`, email: `a${Date.now()}${Math.random()}@example.com` });

const makeSub = async (user, extra = {}) => {
    const start = new Date(Date.UTC(2026, 9, 5));
    const end = new Date(Date.UTC(2026, 9, 12));
    return DMBSubscription.create({
        userId: user._id,
        vendorId: new mongoose.Types.ObjectId(),
        zoneId: new mongoose.Types.ObjectId(),
        status: 'active',
        duration: 'weekly',
        billingCycle: 'weekly',
        startDate: start,
        endDate: end,
        deliveryDays: 'mon_fri',
        deliverySlots: ['lunch'],
        deliverySlot: 'lunch',
        invoiceType: 'b2b_vat',
        companyName: 'Acme Sp. z o.o.',
        companyNip: '7740001454',
        quote: {
            currency: 'PLN',
            totals: { total: 123, foodVat: 8, deliveryVat: 15 },
            lines: [{ key: 'food', label: 'Meals', amount: 100 }, { key: 'food_vat', label: 'Food VAT', amount: 8 }, { key: 'delivery', label: 'Delivery', amount: 10 }, { key: 'delivery_vat', label: 'Delivery VAT', amount: 5 }]
        },
        pricing: { currency: 'PLN', totalPrice: 123, basePricePerDay: 20 },
        deliveryAddress: { street: 'Test 1', city: 'Warsaw', state: 'MZ', label: 'Home' },
        ...extra
    });
};

test('credit note: B2B refund issues a negative, pro-rata, numbered and immutable note', async () => {
    const user = await makeUser();
    const sub = await makeSub(user);
    const tx = { purpose: 'subscription', refs: { subscriptionId: sub.subscriptionId }, amountMinor: 12300, currency: 'PLN', publicId: 'PAY-TEST-1' };
    const note = await creditNotes.issueCreditNoteForRefund({ tx, amountMinor: 6150, refundKey: 'rk-1', reason: 'Half refund', actor: 'admin' });
    assert.ok(note, 'credit note issued');
    assert.match(note.creditNoteNumber, /^CN-PL-\d{4}-\d{2}-0001$/);
    assert.equal(note.invoiceNumber, `INV-${sub.subscriptionId}`);
    assert.equal(note.ratio, 0.5);
    assert.equal(note.totals.gross, -61.5);
    assert.equal(note.totals.vat, -11.5);
    assert.equal(note.totals.net, -50);
    assert.ok(new Date(note.retentionUntil).getTime() > Date.now() + 6.9 * 365 * 86400000, '7-year retention');

    // the same refund never issues a second note; the next refund gets the next number
    assert.equal(await creditNotes.issueCreditNoteForRefund({ tx, amountMinor: 6150, refundKey: 'rk-1' }), null);
    const second = await creditNotes.issueCreditNoteForRefund({ tx, amountMinor: 1230, refundKey: 'rk-2' });
    assert.match(second.creditNoteNumber, /-0002$/);

    // legal documents cannot be changed or deleted
    await assert.rejects(() => creditNotes.DMBCreditNote.updateOne({ _id: note._id }, { reason: 'x' }));
    await assert.rejects(() => creditNotes.DMBCreditNote.deleteOne({ _id: note._id }));
});

test('credit note: B2C receipts and non-subscription payments need none', async () => {
    const user = await makeUser();
    const sub = await makeSub(user, { invoiceType: 'receipt' });
    const tx = { purpose: 'subscription', refs: { subscriptionId: sub.subscriptionId }, amountMinor: 12300, currency: 'PLN', publicId: 'PAY-TEST-2' };
    assert.equal(await creditNotes.issueCreditNoteForRefund({ tx, amountMinor: 12300, refundKey: 'rk-3' }), null);
    assert.equal(await creditNotes.issueCreditNoteForRefund({ tx: { ...tx, purpose: 'tip' }, amountMinor: 100 }), null);
});

test('special instructions: allergen words are flagged, ordinary notes are not', () => {
    assert.equal(specials.isAllergenNote('Allergic to peanuts please'), true);
    assert.equal(specials.isAllergenNote('Bitte ohne Gluten'), true);
    assert.equal(specials.isAllergenNote('Ring the bell twice'), false);
    assert.equal(specials.cleanInstructions('  a   b  '), 'a b');
    assert.equal(specials.cleanInstructions('x'.repeat(500)).length, 300);
});

test('cancellation: a paid running period continues to its end; keep my subscription undoes it', async () => {
    const user = await makeUser();
    const sub = await makeSub(user, { endDate: new Date(Date.now() + 10 * 86400000), startDate: new Date(Date.now() - 2 * 86400000) });
    const res = await subs.cancelSubscription({ subscriptionId: sub.subscriptionId, userId: user._id, reason: 'moving' });
    assert.equal(res.cancellation.atPeriodEnd, true);
    assert.ok(res.cancellation.remainingDeliveries >= 0);
    const after = await DMBSubscription.findById(sub._id).lean();
    assert.equal(after.status, 'active', 'still delivering');
    assert.ok(after.cancelAt && after.cancelRequestedAt);
    assert.equal(after.autoRenew, false);

    await assert.rejects(() => subs.cancelSubscription({ subscriptionId: sub.subscriptionId, userId: user._id }), /already set to end/);

    await subs.keepSubscription({ subscriptionId: sub.subscriptionId, userId: user._id });
    const kept = await DMBSubscription.findById(sub._id).lean();
    assert.equal(kept.cancelAt, null);
    assert.equal(kept.cancelRequestedAt, null);
    assert.equal(kept.autoRenew, true);
});

test('cancellation: a paused subscription is cancelled immediately', async () => {
    const user = await makeUser();
    const sub = await makeSub(user, { status: 'paused' });
    const res = await subs.cancelSubscription({ subscriptionId: sub.subscriptionId, userId: user._id });
    assert.equal(res.cancellation.atPeriodEnd, false);
    assert.equal((await DMBSubscription.findById(sub._id).lean()).status, 'cancelled');
});

test('GDPR: request starts a 30-day clock, execution removes PII, keeps anonymised orders, escalation after 25 days', async () => {
    const user = await makeUser();
    await FoodUser.updateOne({ _id: user._id }, { $set: { walletBalance: 0 } });
    const sub = await makeSub(user, { specialInstructions: 'allergic to nuts' });
    const order = await DMBDailyOrder.create({
        orderType: 'subscription', subscriptionId: sub._id, userId: user._id, vendorId: sub.vendorId, zoneId: sub.zoneId,
        meals: [{ mealPlanId: new mongoose.Types.ObjectId(), name: 'Soup', quantity: 1 }],
        deliveryDate: new Date(Date.UTC(2026, 0, 5)), deliverySlot: 'lunch', status: 'delivered',
        pricing: { foodCost: 20, totalPrice: 21.6, currency: 'PLN' },
        deliveryAddress: { street: 'Private St 5', city: 'Warsaw', state: 'MZ', label: 'Home' },
        specialInstructions: 'allergic to nuts', ratingFeedback: 'great, call me on 600100200'
    });

    const first = await gdpr.requestDeletion(user._id);
    assert.equal(first.alreadyRequested, false);
    const days = (new Date(first.request.dueAt) - new Date(first.request.requestedAt)) / 86400000;
    assert.equal(Math.round(days), 30);
    assert.equal((await gdpr.requestDeletion(user._id)).alreadyRequested, true, 'one open request per customer');

    // not yet 25 days: nothing to escalate
    assert.equal((await gdpr.escalateOverdueRequests(new Date())).escalated, 0);
    assert.equal((await gdpr.escalateOverdueRequests(new Date(Date.now() + 26 * 86400000))).escalated, 1);
    assert.equal((await gdpr.escalateOverdueRequests(new Date(Date.now() + 27 * 86400000))).escalated, 0, 'escalated only once');

    const done = await gdpr.executeDeletion(first.request._id, { adminId: 'cs@example.com' });
    assert.equal(done.request.status, 'completed');
    assert.match(done.request.anonId, /^ANON_\d{8}$/);
    assert.equal(done.request.contactEmail, '');

    const u = await FoodUser.findById(user._id).lean();
    assert.equal(u.name, 'Anonymous Customer');
    assert.equal(u.email, undefined);
    assert.equal(u.isDeleted, true);
    assert.deepEqual(u.addresses, []);

    const o = await DMBDailyOrder.findById(order._id).lean();
    assert.equal(o.anonymisedAs, done.request.anonId);
    assert.equal(o.deliveryAddress.street, '');
    assert.equal(o.specialInstructions, '');
    assert.equal(o.ratingFeedback, '');
    assert.equal(o.pricing.totalPrice, 21.6, 'financial figures are kept');
    const s2 = await DMBSubscription.findById(sub._id).lean();
    assert.equal(s2.status, 'cancelled');
    assert.equal(s2.specialInstructions, '');

    // running it again is harmless
    assert.equal((await gdpr.executeDeletion(first.request._id)).alreadyCompleted, true);
});

test('GDPR: a wallet balance blocks deletion until it is acknowledged', async () => {
    const user = await makeUser();
    await FoodUser.updateOne({ _id: user._id }, { $set: { walletBalance: 25 } });
    const { request } = await gdpr.requestDeletion(user._id);
    await assert.rejects(() => gdpr.executeDeletion(request._id), /wallet balance/i);
    const ok = await gdpr.executeDeletion(request._id, { acknowledgeBalance: true });
    assert.equal(ok.request.status, 'completed');
});
