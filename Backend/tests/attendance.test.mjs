/**
 * Driver attendance tracking: shifts that exist because admin assigned a driver to a zone x slot x date and the driver
 * accepted, going online as an implicit check-in, and the background sweep that resolves finished shifts into
 * completed/no_show.
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards, and refuses to run against anything that is not localhost.
 *
 *   ATTENDANCE_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/attendance.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

// These tests express slot times in UTC; the platform zone is pinned to UTC so "11:00" means 11:00Z here.
process.env.PLATFORM_TIMEZONE = 'UTC';
const BASE_URI = process.env.ATTENDANCE_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error(`Refusing to run: ATTENDANCE_TEST_MONGO_URI must be a plain local mongod (got ${BASE_URI.replace(/\/\/.*@/, '//***@')})`);
}
const DB_NAME = `attendance_test_${Date.now()}`;

const midnightUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);
const hhmmUTC = (d) => `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;

let attSvc, emailModels, emailSvc, ShiftRecord, DeliverySlot, FoodDeliveryPartner, FoodBusinessSettings;

before(async () => {
    await mongoose.connect(BASE_URI, { dbName: DB_NAME });
    attSvc = await import('../src/modules/food/delivery/services/attendance.service.js');
    emailModels = await import('../src/modules/email/email.models.js');
    emailSvc = await import('../src/modules/email/email.service.js');
    ({ ShiftRecord } = await import('../src/modules/food/delivery/models/shiftRecord.model.js'));
    ({ DeliverySlot } = await import('../src/modules/dailymealbox/deliverySlot/deliverySlot.model.js'));
    ({ FoodDeliveryPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js'));
    ({ FoodBusinessSettings } = await import('../src/modules/food/admin/models/businessSettings.model.js'));
});

after(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

beforeEach(async () => {
    delete process.env.EMAIL_HOST; delete process.env.EMAIL_USER; delete process.env.EMAIL_PASS;
    await Promise.all([
        ShiftRecord.deleteMany({}), DeliverySlot.deleteMany({}), FoodDeliveryPartner.deleteMany({}),
        FoodBusinessSettings.deleteMany({}), emailModels.EmailLog.deleteMany({})
    ]);
    emailSvc._setTransporterForTests({ sendMail: async () => ({ messageId: 'test' }), verify: async () => true });
});

const makeDriver = (over = {}) => FoodDeliveryPartner.create({
    name: 'Test Driver',
    phone: `+48${Math.floor(100000000 + Math.random() * 800000000)}`,
    status: 'approved',
    allowedShifts: ['lunch'],
    ...over
});

const makeSlot = (over = {}) => DeliverySlot.create({
    key: 'lunch', name: 'Lunch', startTime: '11:00', endTime: '15:00', availableDays: [0, 1, 2, 3, 4, 5, 6], isEnabled: true,
    ...over
});

const ZONE = new mongoose.Types.ObjectId();
/** A shift the way admin assignment + driver acceptance leaves it. */
const makeShift = (driver, over = {}) => ShiftRecord.create({
    driverId: driver._id, zoneId: ZONE, slotKey: 'lunch', status: 'confirmed', confirmedAt: new Date(),
    assignment: { state: 'accepted', assignedAt: new Date(), respondedAt: new Date() },
    ...over
});

test('checkInDriver checks a driver into whichever open shift window "now" falls inside', async () => {
    const driver = await makeDriver();
    const now = new Date();
    // A slot window that safely spans "now": an hour either side, expressed in UTC HH:MM.
    const start = hhmmUTC(new Date(now.getTime() - 60 * 60_000));
    const end = hhmmUTC(new Date(now.getTime() + 60 * 60_000));
    await makeSlot({ key: 'lunch', startTime: start, endTime: end });
    const shift = await makeShift(driver, { date: midnightUTC(now) });

    const checkedInId = await attSvc.checkInDriver(driver._id);
    assert.equal(String(checkedInId), String(shift._id));

    const reloaded = await ShiftRecord.findById(shift._id).lean();
    assert.equal(reloaded.status, 'confirmed');
    assert.ok(reloaded.checkedInAt);
    // A driver whose shift is still only pending is not checked in:
    const stranger = await makeDriver();
    await ShiftRecord.create({ driverId: stranger._id, zoneId: ZONE, date: midnightUTC(now), slotKey: 'lunch', status: 'scheduled', assignment: { state: 'pending' } });
    assert.equal(await attSvc.checkInDriver(stranger._id), null);
});

test('checkInDriver does nothing when the driver has no shift open right now', async () => {
    const driver = await makeDriver();
    await makeSlot({ key: 'lunch', startTime: '00:01', endTime: '00:02' }); // essentially never "now"
    await makeShift(driver, { date: midnightUTC() });

    const result = await attSvc.checkInDriver(driver._id);
    assert.equal(result, null);
});

test('runAttendanceSweep marks a past, never-checked-in shift as no_show and alerts the admin', async () => {
    await FoodBusinessSettings.create({ supportEmail: 'ops@example.test' });
    const driver = await makeDriver({ name: 'Late Larry' });
    await makeSlot({ key: 'lunch', startTime: '09:00', endTime: '13:00' });
    await makeShift(driver, { date: midnightUTC(addDays(new Date(), -1)) });

    await attSvc.runAttendanceSweep();

    const reloaded = await ShiftRecord.findOne({ driverId: driver._id });
    assert.equal(reloaded.status, 'no_show');

    const alert = await emailModels.EmailLog.findOne({ to: 'ops@example.test', templateKey: 'Driver no-show' });
    assert.ok(alert, 'the admin support inbox is alerted');
});

test('runAttendanceSweep completes a checked-in shift once its window has closed', async () => {
    const driver = await makeDriver();
    await makeSlot({ key: 'lunch', startTime: '09:00', endTime: '13:00' });
    const yesterday = midnightUTC(addDays(new Date(), -1));
    await makeShift(driver, { date: yesterday, checkedInAt: new Date(yesterday.getTime() + 9 * 3_600_000) });

    await attSvc.runAttendanceSweep();

    const reloaded = await ShiftRecord.findOne({ driverId: driver._id });
    assert.equal(reloaded.status, 'completed');
    assert.ok(reloaded.checkedOutAt);
});

test('listShiftsForDriver returns only the drivers own assignments newest-first, each carrying its slot', async () => {
    const driver = await makeDriver();
    await makeSlot({ key: 'lunch', name: 'Lunch' });
    await makeShift(driver, { date: midnightUTC(addDays(new Date(), -1)), status: 'completed' });
    await makeShift(driver, { date: midnightUTC(addDays(new Date(), 1)) });
    await ShiftRecord.create({ driverId: (await makeDriver())._id, zoneId: ZONE, date: midnightUTC(), slotKey: 'lunch', status: 'scheduled', assignment: { state: 'pending' } }); // someone else's

    const shifts = await attSvc.listShiftsForDriver(driver._id);
    assert.equal(shifts.length, 2, 'nothing is generated on demand any more');
    assert.equal(shifts[0].status, 'confirmed', 'newest (tomorrow) first');
    assert.equal(shifts[0].slot.name, 'Lunch');
    assert.equal(shifts[1].status, 'completed');
    assert.ok(shifts.every((s) => 'canUnconfirm' in s));
});

test('adminAttendanceOverview computes completed/(completed+no_show) per driver for the given month, ignoring open shifts', async () => {
    const a = await makeDriver({ name: 'Driver A' });
    const b = await makeDriver({ name: 'Driver B' });
    const now = new Date();
    const inMonth = midnightUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10)));

    await makeShift(a, { date: inMonth, status: 'completed' });
    await makeShift(a, { date: addDays(inMonth, 1), status: 'completed' });
    await makeShift(a, { date: addDays(inMonth, 2), status: 'no_show' });
    await makeShift(a, { date: addDays(inMonth, 3) }); // still open - must not count

    const overview = await attSvc.adminAttendanceOverview({ year: now.getUTCFullYear(), month: now.getUTCMonth() });
    const rowA = overview.find((r) => String(r.driverId) === String(a._id));
    const rowB = overview.find((r) => String(r.driverId) === String(b._id));

    assert.equal(rowA.completed, 2);
    assert.equal(rowA.noShow, 1);
    assert.equal(rowA.assigned, 3);
    assert.equal(rowA.rate, Math.round((2 / 3) * 1000) / 10);
    assert.equal(rowB.rate, null, 'a driver with no resolved shifts this month has no rate yet');

    const flagged = await attSvc.adminAttendanceOverview({ year: now.getUTCFullYear(), month: now.getUTCMonth(), maxRate: 80 });
    assert.ok(flagged.some((r) => String(r.driverId) === String(a._id)), 'driver A (66.7%) is flagged under an 80% threshold');
});

test('tomorrowConfirmationStatus reports which of tomorrow\'s shifts are confirmed', async () => {
    const driver = await makeDriver({ name: 'Tomorrow Tina' });
    const tomorrow = midnightUTC(addDays(new Date(), 1));
    await makeShift(driver, { date: tomorrow });
    await ShiftRecord.create({ driverId: (await makeDriver())._id, zoneId: ZONE, date: tomorrow, slotKey: 'dinner', status: 'scheduled', assignment: { state: 'pending' } });

    const rows = await attSvc.tomorrowConfirmationStatus();
    assert.equal(rows.length, 2);
    assert.equal(rows.find((r) => r.name === 'Tomorrow Tina').confirmed, true);
    assert.equal(rows.find((r) => r.slotKey === 'dinner').state, 'pending');
});

test('unconfirmShift: allowed until 2 hours before the start, refused after; it frees the cell and alerts admin', async () => {
    const driver = await makeDriver();
    const soon = new Date(Date.now() + 60 * 60_000);
    await makeSlot({ key: 'lunch', startTime: hhmmUTC(soon), endTime: hhmmUTC(new Date(soon.getTime() + 3_600_000)) });
    const near = await makeShift(driver, { date: midnightUTC(soon) });
    await assert.rejects(() => attSvc.unconfirmShift(driver._id, near._id), /within 2 hours/);

    const later = await makeShift(driver, { date: midnightUTC(addDays(soon, 2)) });
    const res = await attSvc.unconfirmShift(driver._id, later._id, new Date(), { reason: 'sick' });
    assert.equal(res.status, 'declined');
    assert.equal(res.assignment.state, 'declined');
    assert.equal(res.assignment.declineReason, 'sick');
    const { DMBAdminAlert } = await import('../src/modules/dailymealbox/platform/platform.models.js');
    assert.ok(await DMBAdminAlert.findOne({ type: 'assignment_declined', entityId: String(later._id) }));
});

test('a completed shift records its deliveries; a no-show never qualifies for the minimum guarantee', async () => {
    const driver = await makeDriver({ minimumGuarantee: 80 });
    await makeSlot({ key: 'lunch', startTime: '09:00', endTime: '13:00' });
    const yesterday = midnightUTC(addDays(new Date(), -1));
    await makeShift(driver, { date: yesterday, checkedInAt: new Date(yesterday.getTime() + 9 * 3_600_000) });
    const other = await makeDriver({ minimumGuarantee: 80 });
    await makeShift(other, { date: yesterday });
    await attSvc.runAttendanceSweep();
    const done = await ShiftRecord.findOne({ driverId: driver._id }).lean();
    assert.equal(done.status, 'completed');
    assert.equal(done.deliveriesCount, 0);
    assert.equal(done.minGuaranteeEligible, false, 'no deliveries → no guarantee');
    const missed = await ShiftRecord.findOne({ driverId: other._id }).lean();
    assert.equal(missed.status, 'no_show');
    assert.equal(missed.minGuaranteeEligible, false);
});
