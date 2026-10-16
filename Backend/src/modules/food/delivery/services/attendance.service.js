import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { ShiftRecord } from '../models/shiftRecord.model.js';
import { DeliverySlot } from '../../../dailymealbox/deliverySlot/deliverySlot.model.js';
import { logger } from '../../../../utils/logger.js';
import { queueEmail } from '../../../email/email.service.js';
import { zonedInstant, storageDateStr, localToday } from '../../../../utils/platformTime.js';

/**
 * Driver attendance (Amendment v2 GAP B). Shifts exist only because admin assigned a driver to a zone x slot x date and
 * the driver accepted (see dailymealbox/delivery/driverAssignment.service.js). Slot times are local wall-clock times
 * (PLATFORM_TIMEZONE, default Europe/Warsaw); ShiftRecord.date is the storage form of the local calendar date. A driver
 * who is not online 15 minutes after an accepted shift starts is flagged a no-show; a no-show never earns the minimum
 * guarantee.
 */

/** Never lets an email problem break attendance tracking. */
const emailSafe = (promise, label) => promise.catch((err) => logger.warn(`${label} not sent: ${err?.message || err}`));

const NO_SHOW_GRACE_MS = 15 * 60_000;
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

/** Driver accepts an assignment. */
export const confirmShift = async (driverId, shiftRecordId) => {
    const { respondToAssignment } = await import('../../../dailymealbox/delivery/driverAssignment.service.js');
    return respondToAssignment(driverId, shiftRecordId, { accept: true });
};

/** Driver declines a pending assignment. */
export const declineShift = async (driverId, shiftRecordId, { reason = '' } = {}) => {
    const { respondToAssignment } = await import('../../../dailymealbox/delivery/driverAssignment.service.js');
    return respondToAssignment(driverId, shiftRecordId, { accept: false, reason });
};

/** Driver withdraws an accepted shift — not possible within 2 hours of the shift start. */
export const unconfirmShift = async (driverId, shiftRecordId, now = new Date(), { reason = '' } = {}) => {
    const shift = await ShiftRecord.findOne({ _id: shiftRecordId, driverId });
    if (!shift || !shift.zoneId) throw new Error('Shift not found');
    if (shift.assignment?.state !== 'accepted' || shift.checkedInAt) throw new Error('Only an accepted shift that has not started can be withdrawn');
    const slot = await DeliverySlot.findOne({ key: shift.slotKey }).select('startTime endTime').lean();
    if (slot) {
        const { startAt } = slotWindow(shift.date, slot);
        if (startAt.getTime() - now.getTime() < UNCONFIRM_LOCK_MS) throw new Error('A shift cannot be withdrawn within 2 hours of its start - contact your City Manager');
    }
    shift.assignment.state = 'declined';
    shift.assignment.respondedAt = now;
    shift.assignment.declineReason = String(reason || 'withdrawn').slice(0, 300);
    shift.status = 'declined';
    shift.confirmedAt = null;
    await shift.save();
    try {
        const p = await platform();
        await p.raiseAdminAlert({
            type: 'assignment_declined', severity: 'critical', cityId: await p.cityIdForZone(shift.zoneId),
            title: 'A driver withdrew an accepted shift', message: `${shift.slotKey} on ${storageDateStr(shift.date)} needs another driver.`,
            entityType: 'ShiftRecord', entityId: shift._id, link: '/admin/food/delivery-partners/assignments', dedupeKey: `withdrawn:${shift._id}:${now.getTime()}`
        });
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
        status: 'confirmed',
        'assignment.state': 'accepted',
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
            await ShiftRecord.updateOne({ _id: shift._id }, { $set: { checkedInAt: now } });
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

/** Deliveries and earnings of a driver during one shift (date + slot), for the record and the guarantee rule. */
export const shiftStats = async (shift) => {
    try {
        const { DMBDailyOrder } = await import('../../../dailymealbox/subscription/dmb.dailyOrder.model.js');
        const [row] = await DMBDailyOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': shift.driverId, deliveryDate: shift.date, deliverySlot: shift.slotKey, status: 'delivered' } },
            { $group: { _id: null, n: { $sum: 1 }, earnings: { $sum: { $add: [{ $ifNull: ['$riderEarning', 0] }, { $ifNull: ['$driverTip', 0] }] } } } }
        ]);
        // Hub drop-off stops of the shift pay the driver too; they are not deliveries, so they add to the earnings only.
        const { DMBHubTransfer } = await import('../../../dailymealbox/delivery/hub.models.js');
        const [hub] = await DMBHubTransfer.aggregate([
            { $match: { sourceDriverId: shift.driverId, date: shift.date, slotKey: shift.slotKey, dropConfirmed: true } },
            { $group: { _id: null, earnings: { $sum: '$dropEarning' } } }
        ]);
        return { deliveries: row?.n || 0, earnings: Math.round(((row?.earnings || 0) + (hub?.earnings || 0)) * 100) / 100 };
    } catch {
        return { deliveries: 0, earnings: 0 };
    }
};

/** Background sweep: expires unanswered assignments / warns about uncovered cells, then resolves finished shifts. */
export const runAttendanceSweep = async (now = new Date()) => {
    const today = localToday(now);
    const { sweepAssignments } = await import('../../../dailymealbox/delivery/driverAssignment.service.js');
    const assignments = await sweepAssignments(now);
    const { sweepHubs } = await import('../../../dailymealbox/delivery/hub.service.js');
    Object.assign(assignments, await sweepHubs(now));

    const open = await ShiftRecord.find({
        status: 'confirmed', 'assignment.state': 'accepted',
        date: { $gte: addDays(today, -1), $lte: addDays(today, 1) }
    }).lean();
    if (!open.length) return { resolved: 0, ...assignments };

    const slots = await DeliverySlot.find({ key: { $in: [...new Set(open.map((s) => s.slotKey))] } }).select('key name startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: [...new Set(open.map((s) => String(s.driverId)))] } }).select('name zoneIds fleetPartnerId minimumGuarantee').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));

    let resolved = 0;
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
        }
    }
    return { resolved, ...assignments };
};

/** A driver's own shift history + upcoming shifts (next 7 days are generated on demand). */
export const listShiftsForDriver = async (driverId, { fromDate, toDate, limit = 100 } = {}) => {
    const filter = { driverId, zoneId: { $ne: null } };
    if (fromDate || toDate) {
        filter.date = {};
        if (fromDate) filter.date.$gte = midnightUTC(new Date(fromDate));
        if (toDate) filter.date.$lte = midnightUTC(new Date(toDate));
    }
    const shifts = await ShiftRecord.find(filter).sort({ date: -1 }).limit(limit).lean();
    const slots = await DeliverySlot.find({ key: { $in: [...new Set(shifts.map((s) => s.slotKey))] } }).select('key name icon startTime endTime').lean();
    const slotByKey = new Map(slots.map((s) => [s.key, s]));
    const { FoodZone } = await import('../../admin/models/zone.model.js');
    const zones = await FoodZone.find({ _id: { $in: [...new Set(shifts.map((s) => String(s.zoneId)))] } }).select('name zoneName').lean();
    const zoneName = new Map(zones.map((z) => [String(z._id), z.zoneName || z.name]));
    const now = Date.now();
    return shifts.map((s) => {
        const slot = slotByKey.get(s.slotKey) || null;
        const startAt = slot ? slotWindow(s.date, slot).startAt : null;
        return { ...s, slot, zoneName: zoneName.get(String(s.zoneId)) || '', startsAt: startAt, canUnconfirm: s.status === 'confirmed' && !s.checkedInAt && startAt && startAt.getTime() - now >= UNCONFIRM_LOCK_MS };
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

/** Tomorrow's assignments and whether each driver has accepted. */
export const tomorrowConfirmationStatus = async () => {
    const tomorrow = addDays(localToday(), 1);
    const shifts = await ShiftRecord.find({ date: tomorrow, zoneId: { $ne: null }, status: { $ne: 'holiday' } }).lean();
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: [...new Set(shifts.map((s) => String(s.driverId)))] } }).select('name city phone').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));
    return shifts.map((s) => ({
        driverId: s.driverId,
        name: driverById.get(String(s.driverId))?.name || 'Unknown',
        city: driverById.get(String(s.driverId))?.city || '',
        phone: driverById.get(String(s.driverId))?.phone || '',
        zoneId: s.zoneId,
        slotKey: s.slotKey,
        state: s.assignment?.state,
        confirmed: s.assignment?.state === 'accepted',
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
