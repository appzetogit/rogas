import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { ShiftRecord } from '../models/shiftRecord.model.js';
import { DeliverySlot } from '../../../dailymealbox/deliverySlot/deliverySlot.model.js';
import { logger } from '../../../../utils/logger.js';
import { queueEmail } from '../../../email/email.service.js';

/** Never lets an email problem break attendance tracking. */
const emailSafe = (promise, label) => promise.catch((err) => logger.warn(`${label} not sent: ${err?.message || err}`));

const NO_SHOW_GRACE_MS = 15 * 60_000;
const UNCONFIRMED_REMINDER_MS = 2 * 60 * 60_000;

const midnightUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

const parseHHMM = (s) => {
    const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(s || ''));
    return m ? { h: Number(m[1]), m: Number(m[2]) } : null;
};

/** The slot's actual start/end Date for a shift falling on `date` (a UTC-midnight Date). Handles overnight slots. */
const slotWindow = (date, slot) => {
    const start = parseHHMM(slot.startTime) || { h: 0, m: 0 };
    const end = parseHHMM(slot.endTime) || { h: 23, m: 59 };
    const startAt = new Date(date.getTime() + (start.h * 60 + start.m) * 60_000);
    let endAt = new Date(date.getTime() + (end.h * 60 + end.m) * 60_000);
    if (endAt <= startAt) endAt = new Date(endAt.getTime() + 86_400_000);
    return { startAt, endAt };
};

const adminAlertEmail = async () => {
    try {
        const { FoodBusinessSettings } = await import('../../admin/models/businessSettings.model.js');
        const settings = await FoodBusinessSettings.findOne().select('supportEmail').lean();
        return settings?.supportEmail || '';
    } catch {
        return '';
    }
};

/** Creates any missing ShiftRecords for the given calendar date, from each driver's allowedShifts x each slot's availableDays. */
export const generateShiftsForDate = async (date) => {
    const day = midnightUTC(date);
    const dow = day.getUTCDay();

    const [slots, drivers] = await Promise.all([
        DeliverySlot.find({ isEnabled: true, availableDays: dow }).select('key').lean(),
        FoodDeliveryPartner.find({ status: 'approved', allowedShifts: { $exists: true, $ne: [] } }).select('allowedShifts').lean()
    ]);
    if (!slots.length || !drivers.length) return { created: 0 };

    const slotKeys = new Set(slots.map((s) => s.key));
    const ops = [];
    for (const driver of drivers) {
        for (const key of driver.allowedShifts || []) {
            if (!slotKeys.has(key)) continue;
            ops.push({
                updateOne: {
                    filter: { driverId: driver._id, date: day, slotKey: key },
                    update: { $setOnInsert: { driverId: driver._id, date: day, slotKey: key, status: 'scheduled' } },
                    upsert: true
                }
            });
        }
    }
    if (!ops.length) return { created: 0 };
    const res = await ShiftRecord.bulkWrite(ops, { ordered: false });
    return { created: res.upsertedCount || 0 };
};

/** Driver confirms an upcoming shift (GAP Z). Only a still-"scheduled" shift can be confirmed. */
export const confirmShift = async (driverId, shiftRecordId) => {
    const shift = await ShiftRecord.findOne({ _id: shiftRecordId, driverId });
    if (!shift) throw new Error('Shift not found');
    if (shift.status !== 'scheduled') throw new Error(`Shift is already "${shift.status}"`);
    shift.status = 'confirmed';
    shift.confirmedAt = new Date();
    await shift.save();
    return shift;
};

/** Called whenever a driver goes online. If that falls inside an open shift's window, it doubles as check-in. */
export const checkInDriver = async (driverId) => {
    const now = new Date();
    const day = midnightUTC(now);
    const candidates = await ShiftRecord.find({
        driverId,
        date: { $in: [day, addDays(day, -1)] },
        status: { $in: ['scheduled', 'confirmed'] },
        checkedInAt: null
    }).lean();
    if (!candidates.length) return null;

    const slots = await DeliverySlot.find({ key: { $in: [...new Set(candidates.map((c) => c.slotKey))] } }).select('key startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));

    for (const shift of candidates) {
        const slot = slotByKey.get(shift.slotKey);
        if (!slot) continue;
        const { startAt, endAt } = slotWindow(new Date(shift.date), slot);
        if (now >= startAt && now <= endAt) {
            await ShiftRecord.updateOne({ _id: shift._id }, { $set: { checkedInAt: now, status: 'confirmed' } });
            return shift._id;
        }
    }
    return null;
};

const alertAdminNoShow = async (shift, driver) => {
    const to = await adminAlertEmail();
    if (!to) return;
    await emailSafe(queueEmail({
        to,
        subjectKey: 'Driver no-show',
        bodyKey: '{{driverName}} did not check in for their {{slotKey}} shift on {{date}}. Reassign the route if needed.',
        vars: { driverName: driver?.name || 'A driver', slotKey: shift.slotKey, date: new Date(shift.date).toISOString().slice(0, 10) }
    }), `No-show alert for driver ${shift.driverId}`);
};

const alertAdminUnconfirmed = async (shift, driver) => {
    const to = await adminAlertEmail();
    if (!to) return;
    await emailSafe(queueEmail({
        to,
        subjectKey: 'Driver has not confirmed an upcoming shift',
        bodyKey: '{{driverName}} has not confirmed their {{slotKey}} shift starting in about 2 hours, on {{date}}.',
        vars: { driverName: driver?.name || 'A driver', slotKey: shift.slotKey, date: new Date(shift.date).toISOString().slice(0, 10) }
    }), `Unconfirmed-shift alert for driver ${shift.driverId}`);
};

/** Background sweep: seeds tomorrow's shifts, resolves finished ones (no-show / completed), reminds admins of unconfirmed ones. */
export const runAttendanceSweep = async () => {
    const now = new Date();
    const today = midnightUTC(now);
    await generateShiftsForDate(addDays(today, 1));

    const open = await ShiftRecord.find({
        status: { $in: ['scheduled', 'confirmed'] },
        date: { $gte: addDays(today, -1), $lte: addDays(today, 1) }
    }).lean();
    if (!open.length) return { resolved: 0, reminded: 0 };

    const slots = await DeliverySlot.find({ key: { $in: [...new Set(open.map((s) => s.slotKey))] } }).select('key startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    const driverIds = [...new Set(open.map((s) => String(s.driverId)))];
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: driverIds } }).select('name').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));

    let resolved = 0;
    let reminded = 0;
    for (const shift of open) {
        const slot = slotByKey.get(shift.slotKey);
        if (!slot) continue;
        const { startAt, endAt } = slotWindow(new Date(shift.date), slot);
        const driver = driverById.get(String(shift.driverId));

        if (!shift.checkedInAt && now.getTime() >= startAt.getTime() + NO_SHOW_GRACE_MS) {
            await ShiftRecord.updateOne({ _id: shift._id }, { $set: { status: 'no_show' } });
            await alertAdminNoShow(shift, driver);
            resolved++;
            continue;
        }
        if (shift.checkedInAt && now >= endAt) {
            await ShiftRecord.updateOne({ _id: shift._id }, { $set: { status: 'completed', checkedOutAt: now } });
            resolved++;
            continue;
        }
        if (shift.status === 'scheduled' && !shift.unconfirmedAlertSentAt) {
            const msToStart = startAt.getTime() - now.getTime();
            if (msToStart > 0 && msToStart <= UNCONFIRMED_REMINDER_MS) {
                await ShiftRecord.updateOne({ _id: shift._id }, { $set: { unconfirmedAlertSentAt: now } });
                await alertAdminUnconfirmed(shift, driver);
                reminded++;
            }
        }
    }
    return { resolved, reminded };
};

/** A driver's own shift history + upcoming shifts. */
export const listShiftsForDriver = async (driverId, { fromDate, toDate, limit = 100 } = {}) => {
    const filter = { driverId };
    if (fromDate || toDate) {
        filter.date = {};
        if (fromDate) filter.date.$gte = midnightUTC(new Date(fromDate));
        if (toDate) filter.date.$lte = midnightUTC(new Date(toDate));
    }
    const shifts = await ShiftRecord.find(filter).sort({ date: -1 }).limit(limit).lean();
    const slots = await DeliverySlot.find({ key: { $in: [...new Set(shifts.map((s) => s.slotKey))] } }).select('key name icon startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    return shifts.map((s) => ({ ...s, slot: slotByKey.get(s.slotKey) || null }));
};

/** Every approved driver's attendance rate for a month: completed / (completed + no_show). Future/open shifts don't count. */
export const adminAttendanceOverview = async ({ year, month, maxRate } = {}) => {
    const now = new Date();
    const y = year ?? now.getUTCFullYear();
    const m = month ?? now.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 1));

    const [drivers, rows] = await Promise.all([
        FoodDeliveryPartner.find({ status: 'approved' }).select('name city fleetPartnerId').lean(),
        ShiftRecord.aggregate([
            { $match: { date: { $gte: from, $lt: to }, status: { $in: ['completed', 'no_show'] } } },
            { $group: { _id: { driverId: '$driverId', status: '$status' }, count: { $sum: 1 } } }
        ])
    ]);

    const byDriver = new Map();
    for (const r of rows) {
        const key = String(r._id.driverId);
        const entry = byDriver.get(key) || { completed: 0, noShow: 0 };
        if (r._id.status === 'completed') entry.completed = r.count;
        else entry.noShow = r.count;
        byDriver.set(key, entry);
    }

    const out = drivers.map((d) => {
        const entry = byDriver.get(String(d._id)) || { completed: 0, noShow: 0 };
        const assigned = entry.completed + entry.noShow;
        const rate = assigned ? Math.round((entry.completed / assigned) * 1000) / 10 : null;
        return { driverId: d._id, name: d.name, city: d.city, fleetPartnerId: d.fleetPartnerId, completed: entry.completed, noShow: entry.noShow, assigned, rate };
    });
    return maxRate != null ? out.filter((r) => r.rate != null && r.rate < Number(maxRate)) : out;
};

/** AP-06's "Tomorrow's Shifts" view (GAP Z): who's confirmed for tomorrow and who isn't yet. */
export const tomorrowConfirmationStatus = async () => {
    const tomorrow = addDays(midnightUTC(new Date()), 1);
    const shifts = await ShiftRecord.find({ date: tomorrow }).lean();
    const driverIds = [...new Set(shifts.map((s) => String(s.driverId)))];
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: driverIds } }).select('name city').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));
    return shifts.map((s) => ({
        driverId: s.driverId,
        name: driverById.get(String(s.driverId))?.name || 'Unknown',
        city: driverById.get(String(s.driverId))?.city || '',
        slotKey: s.slotKey,
        confirmed: s.status === 'confirmed',
        confirmedAt: s.confirmedAt
    }));
};

let jobTimer = null;
export const startAttendanceJobs = ({ everyMs = 15 * 60_000 } = {}) => {
    if (jobTimer || process.env.ATTENDANCE_JOBS === 'false') return;
    jobTimer = setInterval(async () => {
        try {
            await runAttendanceSweep();
        } catch (err) {
            logger.warn(`Attendance sweep failed: ${err?.message || err}`);
        }
    }, everyMs);
    jobTimer.unref?.();
};
export const stopAttendanceJobs = () => {
    if (jobTimer) clearInterval(jobTimer);
    jobTimer = null;
};
