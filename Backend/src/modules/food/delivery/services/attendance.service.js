import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { ShiftRecord } from '../models/shiftRecord.model.js';
import { DeliverySlot } from '../../../dailymealbox/deliverySlot/deliverySlot.model.js';
import { logger } from '../../../../utils/logger.js';
import { queueEmail } from '../../../email/email.service.js';
import { zonedInstant, storageDateStr, localToday, addDays as addLocalDays } from '../../../../utils/platformTime.js';

/**
 * Driver attendance (Amendment v2 GAP B) and shift confirmation (GAP Z, ACM-152).
 *
 * Slot times are local wall-clock times (PLATFORM_TIMEZONE, default Europe/Warsaw); ShiftRecord.date is the storage
 * form of the local calendar date. With ACM-152 on for the driver's city, drivers are reminded 24h before each shift
 * and admins are alerted when a shift is still unconfirmed 2h before it starts. No-shows (not online 15 minutes after
 * the start) are always detected. A no-show never earns the minimum guarantee.
 */

/** Never lets an email problem break attendance tracking. */
const emailSafe = (promise, label) => promise.catch((err) => logger.warn(`${label} not sent: ${err?.message || err}`));

const NO_SHOW_GRACE_MS = 15 * 60_000;
const UNCONFIRMED_REMINDER_MS = 2 * 60 * 60_000;
const DRIVER_REMINDER_MS = 24 * 60 * 60_000;
const UNCONFIRM_LOCK_MS = 2 * 60 * 60_000;

const midnightUTC = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const addDays = (d, n) => new Date(d.getTime() + n * 86_400_000);

/** The slot's actual start/end instants for a shift on `date` (a storage date). Handles overnight slots and DST. */
export const slotWindow = (date, slot) => {
    const day = storageDateStr(date);
    const startAt = zonedInstant(day, slot.startTime || '00:00');
    let endAt = zonedInstant(day, slot.endTime || '23:59');
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

const platform = async () => import('../../../dailymealbox/platform/platformConfig.service.js');

/** ACM-152 for a driver (first zone's city), cached per sweep. */
const confirmationRequired = async (driver, cache) => {
    const key = String(driver?.zoneIds?.[0] || '');
    if (cache?.has(key)) return cache.get(key);
    let on = false;
    try {
        on = await (await platform()).isEnabled('driverShiftConfirmation', { zoneId: driver?.zoneIds?.[0] });
    } catch { /* default off */ }
    cache?.set(key, on);
    return on;
};

/** Confirmed platform holidays that apply to a driver (by the cities of their zones). */
const driverHolidays = async (driver, cache) => {
    const key = (driver?.zoneIds || []).map(String).sort().join(',');
    if (cache?.has(key)) return cache.get(key);
    const set = new Set();
    try {
        const { holidaySetForCity } = await import('../../../dailymealbox/platform/holiday.service.js');
        const { cityIdForZone } = await platform();
        for (const d of await holidaySetForCity(null)) set.add(d);
        for (const z of driver?.zoneIds || []) for (const d of await holidaySetForCity(await cityIdForZone(z))) set.add(d);
    } catch { /* no holidays */ }
    cache?.set(key, set);
    return set;
};

/**
 * Creates any missing ShiftRecords for the given calendar date, from each driver's allowedShifts x each slot's
 * availableDays. Slots linked to another slot's driver shift do not create shifts of their own. On a platform holiday
 * the shift is created as "holiday" (the driver app shows "Platform Holiday — no shift").
 */
export const generateShiftsForDate = async (date, { driverId } = {}) => {
    const day = midnightUTC(date);
    const dow = day.getUTCDay();
    const driverFilter = { status: 'approved', allowedShifts: { $exists: true, $ne: [] } };
    if (driverId) driverFilter._id = driverId;

    const [slots, drivers] = await Promise.all([
        DeliverySlot.find({ isEnabled: true, availableDays: dow }).select('key linkedShiftKey').lean(),
        FoodDeliveryPartner.find(driverFilter).select('allowedShifts zoneIds').lean()
    ]);
    if (!slots.length || !drivers.length) return { created: 0 };

    const slotKeys = new Set(slots.filter((s) => !s.linkedShiftKey || s.linkedShiftKey === s.key).map((s) => s.key));
    const holidayCache = new Map();
    const ops = [];
    for (const driver of drivers) {
        const holidays = await driverHolidays(driver, holidayCache);
        const isHoliday = holidays.has(storageDateStr(day));
        for (const key of driver.allowedShifts || []) {
            if (!slotKeys.has(key)) continue;
            ops.push({
                updateOne: {
                    filter: { driverId: driver._id, date: day, slotKey: key },
                    update: { $setOnInsert: { driverId: driver._id, date: day, slotKey: key, status: isHoliday ? 'holiday' : 'scheduled' } },
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

/** Driver withdraws a confirmation — not possible within 2 hours of the shift start (GAP Z). */
export const unconfirmShift = async (driverId, shiftRecordId, now = new Date()) => {
    const shift = await ShiftRecord.findOne({ _id: shiftRecordId, driverId });
    if (!shift) throw new Error('Shift not found');
    if (shift.status !== 'confirmed' || shift.checkedInAt) throw new Error('Only a confirmed shift that has not started can be unconfirmed');
    const slot = await DeliverySlot.findOne({ key: shift.slotKey }).select('startTime endTime').lean();
    if (slot) {
        const { startAt } = slotWindow(shift.date, slot);
        if (startAt.getTime() - now.getTime() < UNCONFIRM_LOCK_MS) throw new Error('A shift cannot be unconfirmed within 2 hours of its start — contact your City Manager');
    }
    shift.status = 'scheduled';
    shift.confirmedAt = null;
    await shift.save();
    try {
        const p = await platform();
        await p.raiseAdminAlert({ type: 'shift_unconfirmed', severity: 'warning', title: 'A driver withdrew a shift confirmation', message: `${shift.slotKey} on ${storageDateStr(shift.date)}`, entityType: 'ShiftRecord', entityId: shift._id, link: '/admin/food/delivery-partners/attendance' });
    } catch { /* alert is best-effort */ }
    return shift;
};

/** Called whenever a driver goes online. If that falls inside an open shift's window, it doubles as check-in. */
export const checkInDriver = async (driverId) => {
    const now = new Date();
    const day = localToday(now);
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
    try {
        const p = await platform();
        const cityId = driver?.zoneIds?.[0] ? await p.cityIdForZone(driver.zoneIds[0]) : null;
        await p.raiseAdminAlert({
            type: 'driver_no_show', severity: 'critical', cityId,
            title: `No-show: ${driver?.name || 'driver'} (${shift.slotKey})`,
            message: `${driver?.name || 'A driver'} did not go online within 15 minutes of the ${shift.slotKey} shift on ${storageDateStr(shift.date)}.`,
            entityType: 'ShiftRecord', entityId: shift._id, link: '/admin/food/delivery-partners/attendance',
            data: { driverId: String(shift.driverId), fleetPartnerId: driver?.fleetPartnerId ? String(driver.fleetPartnerId) : null },
            dedupeKey: `noshow:${shift._id}`
        });
    } catch { /* alert is best-effort */ }
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
    try {
        const p = await platform();
        const cityId = driver?.zoneIds?.[0] ? await p.cityIdForZone(driver.zoneIds[0]) : null;
        await p.raiseAdminAlert({
            type: 'shift_unconfirmed', severity: 'warning', cityId,
            title: `Unconfirmed shift: ${driver?.name || 'driver'} (${shift.slotKey})`,
            message: `${driver?.name || 'A driver'} has not confirmed the ${shift.slotKey} shift starting in about 2 hours (${storageDateStr(shift.date)}). Call the driver.`,
            entityType: 'ShiftRecord', entityId: shift._id, link: '/admin/food/delivery-partners/attendance', dedupeKey: `unconfirmed:${shift._id}`
        });
    } catch { /* alert is best-effort */ }
    const to = await adminAlertEmail();
    if (!to) return;
    await emailSafe(queueEmail({
        to,
        subjectKey: 'Driver has not confirmed an upcoming shift',
        bodyKey: '{{driverName}} has not confirmed their {{slotKey}} shift starting in about 2 hours, on {{date}}.',
        vars: { driverName: driver?.name || 'A driver', slotKey: shift.slotKey, date: new Date(shift.date).toISOString().slice(0, 10) }
    }), `Unconfirmed-shift alert for driver ${shift.driverId}`);
};

const remindDriver = async (shift, slot) => {
    try {
        const { notify } = await import('../../../dailymealbox/notifications/notify.js');
        const { msg } = await import('../../../i18n/i18n.service.js');
        await notify({
            to: 'driver', id: shift.driverId, event: 'shift_confirm_reminder',
            title: msg('Confirm your shift tomorrow'),
            body: msg('Your {{slot}} shift starts tomorrow at {{time}}. Confirm you\'re available →', { slot: slot.name || shift.slotKey, time: slot.startTime }),
            link: '/food/delivery/shifts', data: { shiftId: String(shift._id) }
        });
    } catch (err) {
        logger.warn(`[attendance] reminder for shift ${shift._id} failed: ${err.message}`);
    }
};

/** Deliveries and earnings of a driver during one shift (date + slot), for the record and the guarantee rule. */
const shiftStats = async (shift) => {
    try {
        const { DMBDailyOrder } = await import('../../../dailymealbox/subscription/dmb.dailyOrder.model.js');
        const [row] = await DMBDailyOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': shift.driverId, deliveryDate: shift.date, deliverySlot: shift.slotKey, status: 'delivered' } },
            { $group: { _id: null, n: { $sum: 1 }, earnings: { $sum: { $add: [{ $ifNull: ['$riderEarning', 0] }, { $ifNull: ['$driverTip', 0] }] } } } }
        ]);
        return { deliveries: row?.n || 0, earnings: Math.round((row?.earnings || 0) * 100) / 100 };
    } catch {
        return { deliveries: 0, earnings: 0 };
    }
};

/** Background sweep: seeds tomorrow's shifts, resolves finished ones (no-show / completed), sends reminders. */
export const runAttendanceSweep = async () => {
    const now = new Date();
    const today = localToday(now);
    await generateShiftsForDate(addDays(today, 1));

    const open = await ShiftRecord.find({
        status: { $in: ['scheduled', 'confirmed'] },
        date: { $gte: addDays(today, -1), $lte: addDays(today, 1) }
    }).lean();
    if (!open.length) return { resolved: 0, reminded: 0, driverReminders: 0 };

    const slots = await DeliverySlot.find({ key: { $in: [...new Set(open.map((s) => s.slotKey))] } }).select('key name startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    const driverIds = [...new Set(open.map((s) => String(s.driverId)))];
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: driverIds } }).select('name zoneIds fleetPartnerId minimumGuarantee').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));
    const acmCache = new Map();

    let resolved = 0;
    let reminded = 0;
    let driverReminders = 0;
    for (const shift of open) {
        const slot = slotByKey.get(shift.slotKey);
        if (!slot) continue;
        const { startAt, endAt } = slotWindow(new Date(shift.date), slot);
        const driver = driverById.get(String(shift.driverId));

        if (!shift.checkedInAt && now.getTime() >= startAt.getTime() + NO_SHOW_GRACE_MS) {
            await ShiftRecord.updateOne({ _id: shift._id }, { $set: { status: 'no_show', minGuaranteeEligible: false } });
            await alertAdminNoShow(shift, driver);
            resolved++;
            continue;
        }
        if (shift.checkedInAt && now >= endAt) {
            const stats = await shiftStats(shift);
            const threshold = Number(process.env.MIN_GUARANTEE_MIN_DELIVERIES || 1);
            await ShiftRecord.updateOne({ _id: shift._id }, {
                $set: {
                    status: 'completed', checkedOutAt: now, earnings: stats.earnings, deliveriesCount: stats.deliveries,
                    // Minimum guarantee: only for a completed shift with at least the minimum number of deliveries.
                    minGuaranteeEligible: Boolean(driver?.minimumGuarantee > 0 && stats.deliveries >= threshold)
                }
            });
            resolved++;
            continue;
        }
        const msToStart = startAt.getTime() - now.getTime();
        if (shift.status === 'scheduled' && msToStart > 0 && await confirmationRequired(driver, acmCache)) {
            if (!shift.reminder24SentAt && msToStart <= DRIVER_REMINDER_MS && msToStart > UNCONFIRMED_REMINDER_MS) {
                await ShiftRecord.updateOne({ _id: shift._id }, { $set: { reminder24SentAt: now } });
                await remindDriver(shift, slot);
                driverReminders++;
            }
            if (!shift.unconfirmedAlertSentAt && msToStart <= UNCONFIRMED_REMINDER_MS) {
                await ShiftRecord.updateOne({ _id: shift._id }, { $set: { unconfirmedAlertSentAt: now } });
                await alertAdminUnconfirmed(shift, driver);
                reminded++;
            }
        }
    }
    return { resolved, reminded, driverReminders };
};

/** A driver's own shift history + upcoming shifts (next 7 days are generated on demand). */
export const listShiftsForDriver = async (driverId, { fromDate, toDate, limit = 100 } = {}) => {
    const today = localToday();
    for (let i = 0; i < 7; i++) await generateShiftsForDate(addLocalDays(today, i), { driverId });
    const filter = { driverId };
    if (fromDate || toDate) {
        filter.date = {};
        if (fromDate) filter.date.$gte = midnightUTC(new Date(fromDate));
        if (toDate) filter.date.$lte = midnightUTC(new Date(toDate));
    }
    const shifts = await ShiftRecord.find(filter).sort({ date: -1 }).limit(limit).lean();
    const slots = await DeliverySlot.find({ key: { $in: [...new Set(shifts.map((s) => s.slotKey))] } }).select('key name icon startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    const now = Date.now();
    return shifts.map((s) => {
        const slot = slotByKey.get(s.slotKey) || null;
        const startAt = slot ? slotWindow(s.date, slot).startAt : null;
        return { ...s, slot, startsAt: startAt, canUnconfirm: s.status === 'confirmed' && !s.checkedInAt && startAt && startAt.getTime() - now >= UNCONFIRM_LOCK_MS };
    });
};

/** Every approved driver's attendance rate for a month: completed / (completed + no_show). Future/open shifts don't count. */
export const adminAttendanceOverview = async ({ year, month, maxRate, fleetPartnerId } = {}) => {
    const now = new Date();
    const y = year ?? now.getUTCFullYear();
    const m = month ?? now.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1));
    const to = new Date(Date.UTC(y, m + 1, 1));
    const driverFilter = { status: 'approved' };
    if (fleetPartnerId) driverFilter.fleetPartnerId = fleetPartnerId;

    const [drivers, rows] = await Promise.all([
        FoodDeliveryPartner.find(driverFilter).select('name city fleetPartnerId').lean(),
        ShiftRecord.aggregate([
            { $match: { date: { $gte: from, $lt: to }, status: { $in: ['completed', 'no_show'] } } },
            { $group: { _id: { driverId: '$driverId', status: '$status' }, count: { $sum: 1 }, guarantee: { $sum: { $cond: ['$minGuaranteeEligible', 1, 0] } } } }
        ])
    ]);

    const byDriver = new Map();
    for (const r of rows) {
        const key = String(r._id.driverId);
        const entry = byDriver.get(key) || { completed: 0, noShow: 0, guaranteeShifts: 0 };
        if (r._id.status === 'completed') { entry.completed = r.count; entry.guaranteeShifts = r.guarantee; }
        else entry.noShow = r.count;
        byDriver.set(key, entry);
    }
    let fleetNames = new Map();
    try {
        const { FleetPartner } = await import('../../../dailymealbox/vendor/fleetPartner.model.js');
        fleetNames = new Map((await FleetPartner.find({ _id: { $in: drivers.map((d) => d.fleetPartnerId).filter(Boolean) } }).select('companyName').lean()).map((f) => [String(f._id), f.companyName]));
    } catch { /* optional */ }

    const out = drivers.map((d) => {
        const entry = byDriver.get(String(d._id)) || { completed: 0, noShow: 0, guaranteeShifts: 0 };
        const assigned = entry.completed + entry.noShow;
        const rate = assigned ? Math.round((entry.completed / assigned) * 1000) / 10 : null;
        return {
            driverId: d._id, name: d.name, city: d.city, fleetPartnerId: d.fleetPartnerId, fleetPartnerName: fleetNames.get(String(d.fleetPartnerId)) || '',
            completed: entry.completed, noShow: entry.noShow, assigned, rate, guaranteeShifts: entry.guaranteeShifts, flagged: rate !== null && rate < 80
        };
    });
    return maxRate != null ? out.filter((r) => r.rate != null && r.rate < Number(maxRate)) : out;
};

/** AP-06's "Tomorrow's Shifts" view (GAP Z): who's confirmed for tomorrow and who isn't yet. */
export const tomorrowConfirmationStatus = async () => {
    const tomorrow = addDays(localToday(), 1);
    await generateShiftsForDate(tomorrow);
    const shifts = await ShiftRecord.find({ date: tomorrow, status: { $ne: 'holiday' } }).lean();
    const driverIds = [...new Set(shifts.map((s) => String(s.driverId)))];
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: driverIds } }).select('name city phone').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));
    return shifts.map((s) => ({
        driverId: s.driverId,
        name: driverById.get(String(s.driverId))?.name || 'Unknown',
        city: driverById.get(String(s.driverId))?.city || '',
        phone: driverById.get(String(s.driverId))?.phone || '',
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
