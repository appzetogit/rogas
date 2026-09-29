/**
 * Driver attendance tracking: shift generation (from allowedShifts x DeliverySlot.availableDays), the
 * driver confirming a shift, going online as an implicit check-in, and the background sweep that resolves
 * finished shifts into completed/no_show and reminds admins of ones still unconfirmed close to start time.
 *
 * Needs a LOCAL MongoDB (default mongodb://127.0.0.1:27017). It creates a throw-away database and drops it
 * afterwards, and refuses to run against anything that is not localhost.
 *
 *   ATTENDANCE_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/attendance.test.mjs
 */
import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';

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

test('generateShiftsForDate creates one shift per (driver, slot) that is offered that day', async () => {
    const driver = await makeDriver({ allowedShifts: ['lunch', 'dinner'] });
    await makeSlot({ key: 'lunch' });
    await makeSlot({ key: 'dinner', startTime: '17:00', endTime: '21:00' });
    await makeSlot({ key: 'breakfast', availableDays: [] }); // never offered — never scheduled

    const today = midnightUTC();
    const { created } = await attSvc.generateShiftsForDate(today);
    assert.equal(created, 2, 'only the two slots the driver is allowed and that run today are created');

    const shifts = await ShiftRecord.find({ driverId: driver._id }).lean();
    assert.deepEqual(shifts.map((s) => s.slotKey).sort(), ['dinner', 'lunch']);
    assert.ok(shifts.every((s) => s.status === 'scheduled'));
});

test('generateShiftsForDate is idempotent — running it twice does not duplicate rows', async () => {
    await makeDriver();
    await makeSlot();
    const today = midnightUTC();
    await attSvc.generateShiftsForDate(today);
    const { created: secondRun } = await attSvc.generateShiftsForDate(today);
    assert.equal(secondRun, 0);
    assert.equal(await ShiftRecord.countDocuments({}), 1);
});

test('a driver not scheduled to work a slot that day gets no shift for it', async () => {
    await makeDriver({ allowedShifts: ['lunch'] });
    await makeSlot({ key: 'lunch', availableDays: [] }); // slot not offered on any day
    await attSvc.generateShiftsForDate(midnightUTC());
    assert.equal(await ShiftRecord.countDocuments({}), 0);
});

test('confirmShift moves a scheduled shift to confirmed, and refuses a shift that is not scheduled', async () => {
    const driver = await makeDriver();
    const shift = await ShiftRecord.create({ driverId: driver._id, date: midnightUTC(), slotKey: 'lunch', status: 'scheduled' });

    const confirmed = await attSvc.confirmShift(driver._id, shift._id);
    assert.equal(confirmed.status, 'confirmed');
    assert.ok(confirmed.confirmedAt);

    await assert.rejects(() => attSvc.confirmShift(driver._id, shift._id), /already "confirmed"/);
});

test('checkInDriver checks a driver into whichever open shift window "now" falls inside', async () => {
    const driver = await makeDriver();
    const now = new Date();
    // A slot window that safely spans "now": an hour either side, expressed in UTC HH:MM.
    const start = hhmmUTC(new Date(now.getTime() - 60 * 60_000));
    const end = hhmmUTC(new Date(now.getTime() + 60 * 60_000));
    await makeSlot({ key: 'lunch', startTime: start, endTime: end });
    const shift = await ShiftRecord.create({ driverId: driver._id, date: midnightUTC(now), slotKey: 'lunch', status: 'scheduled' });

    const checkedInId = await attSvc.checkInDriver(driver._id);
    assert.equal(String(checkedInId), String(shift._id));

    const reloaded = await ShiftRecord.findById(shift._id).lean();
    assert.equal(reloaded.status, 'confirmed');
    assert.ok(reloaded.checkedInAt);
});

test('checkInDriver does nothing when the driver has no shift open right now', async () => {
    const driver = await makeDriver();
    await makeSlot({ key: 'lunch', startTime: '00:01', endTime: '00:02' }); // essentially never "now"
    await ShiftRecord.create({ driverId: driver._id, date: midnightUTC(), slotKey: 'lunch', status: 'scheduled' });

    const result = await attSvc.checkInDriver(driver._id);
    assert.equal(result, null);
});

test('runAttendanceSweep marks a past, never-checked-in shift as no_show and alerts the admin', async () => {
    await FoodBusinessSettings.create({ supportEmail: 'ops@example.test' });
    const driver = await makeDriver({ name: 'Late Larry' });
    await makeSlot({ key: 'lunch', startTime: '09:00', endTime: '13:00' });
    await ShiftRecord.create({ driverId: driver._id, date: midnightUTC(addDays(new Date(), -1)), slotKey: 'lunch', status: 'scheduled' });

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
    await ShiftRecord.create({ driverId: driver._id, date: yesterday, slotKey: 'lunch', status: 'confirmed', checkedInAt: new Date(yesterday.getTime() + 9 * 3_600_000) });

    await attSvc.runAttendanceSweep();

    const reloaded = await ShiftRecord.findOne({ driverId: driver._id });
    assert.equal(reloaded.status, 'completed');
    assert.ok(reloaded.checkedOutAt);
});

test('runAttendanceSweep reminds the admin once about a shift starting soon that is still unconfirmed', async () => {
    await FoodBusinessSettings.create({ supportEmail: 'ops@example.test' });
    const driver = await makeDriver({ name: 'Soon Sam' });
    const target = new Date(Date.now() + 90 * 60_000); // ~90 minutes from now: inside the 2h reminder window
    const shiftDate = midnightUTC(target);
    await makeSlot({ key: 'lunch', startTime: hhmmUTC(target), endTime: hhmmUTC(new Date(target.getTime() + 4 * 3_600_000)) });
    await ShiftRecord.create({ driverId: driver._id, date: shiftDate, slotKey: 'lunch', status: 'scheduled' });

    await attSvc.runAttendanceSweep();
    const afterFirst = await ShiftRecord.findOne({ driverId: driver._id });
    assert.ok(afterFirst.unconfirmedAlertSentAt, 'reminder fired once');
    assert.equal(afterFirst.status, 'scheduled', 'the reminder does not itself confirm the shift');

    const alertCountBefore = await emailModels.EmailLog.countDocuments({ templateKey: 'Driver has not confirmed an upcoming shift' });
    assert.equal(alertCountBefore, 1);

    await attSvc.runAttendanceSweep(); // a second sweep must not re-alert
    const alertCountAfter = await emailModels.EmailLog.countDocuments({ templateKey: 'Driver has not confirmed an upcoming shift' });
    assert.equal(alertCountAfter, 1, 'no duplicate reminder on the next sweep');
});

test('runAttendanceSweep also seeds tomorrow\'s shifts so there is something for drivers to confirm ahead of time', async () => {
    await makeDriver();
    await makeSlot();
    await attSvc.runAttendanceSweep();

    const tomorrow = midnightUTC(addDays(new Date(), 1));
    const count = await ShiftRecord.countDocuments({ date: tomorrow });
    assert.equal(count, 1);
});

test('listShiftsForDriver returns a driver\'s own shifts newest-first, each carrying its slot info', async () => {
    const driver = await makeDriver();
    await makeSlot({ key: 'lunch', name: 'Lunch' });
    await ShiftRecord.create({ driverId: driver._id, date: midnightUTC(addDays(new Date(), -1)), slotKey: 'lunch', status: 'completed' });
    await ShiftRecord.create({ driverId: driver._id, date: midnightUTC(), slotKey: 'lunch', status: 'scheduled' });

    const shifts = await attSvc.listShiftsForDriver(driver._id);
    assert.equal(shifts.length, 2);
    assert.equal(shifts[0].status, 'scheduled', 'newest (today) first');
    assert.equal(shifts[0].slot.name, 'Lunch');
});

test('adminAttendanceOverview computes completed/(completed+no_show) per driver for the given month, ignoring open shifts', async () => {
    const a = await makeDriver({ name: 'Driver A' });
    const b = await makeDriver({ name: 'Driver B' });
    const now = new Date();
    const inMonth = midnightUTC(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 10)));

    await ShiftRecord.create({ driverId: a._id, date: inMonth, slotKey: 'lunch', status: 'completed' });
    await ShiftRecord.create({ driverId: a._id, date: addDays(inMonth, 1), slotKey: 'lunch', status: 'completed' });
    await ShiftRecord.create({ driverId: a._id, date: addDays(inMonth, 2), slotKey: 'lunch', status: 'no_show' });
    await ShiftRecord.create({ driverId: a._id, date: addDays(inMonth, 3), slotKey: 'lunch', status: 'scheduled' }); // must not count

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
    await ShiftRecord.create({ driverId: driver._id, date: tomorrow, slotKey: 'lunch', status: 'confirmed', confirmedAt: new Date() });

    const rows = await attSvc.tomorrowConfirmationStatus();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, 'Tomorrow Tina');
    assert.equal(rows[0].confirmed, true);
});
