import mongoose from 'mongoose';
import { ShiftRecord } from '../../food/delivery/models/shiftRecord.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { FoodZone } from '../../food/admin/models/zone.model.js';
import { DeliverySlot } from '../deliverySlot/deliverySlot.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { logger } from '../../../utils/logger.js';
import { localToday, localDateStr, localTimeHHMM, dateOnlyFromStr, storageDateStr, zonedInstant, addDays } from '../../../utils/platformTime.js';

/**
 * Zone x Slot driver assignment — planned by admin the day before.
 *
 * A "cell" is one delivery zone on one slot (shift) on one date. Admin assigns one or more drivers to a cell; each driver
 * accepts or declines in the app. Everything that can go wrong (a decline, no answer, a cell with orders and nobody
 * accepted, a zone/slot nobody planned) raises an admin alert — nothing is ever auto-assigned or broadcast.
 *
 * Keep these concepts apart:
 *   primary zone          driver.primaryZoneId         the driver's normal area
 *   authorised zones      driver.zoneIds               every zone the driver may be assigned to
 *   slot assignment       ShiftRecord (+ .assignment)  the zone + slot + date a driver is scheduled for
 *   actual route          built from accepted assignments at the slot cutoff (see route stage)
 */

const ALERT_LINK = '/admin/food/delivery-partners/assignments';

const platform = async () => import('../platform/platformConfig.service.js');
const objectId = (v) => (mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);

export class AssignmentError extends Error {
    constructor(message, code = 'ASSIGNMENT_ERROR', statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}

/** The shift whose drivers cover a slot: a slot may be covered by another slot's shift (see DeliverySlot.linkedShiftKey). */
export const shiftKeyOf = (slot) => (slot.linkedShiftKey && slot.linkedShiftKey !== slot.key ? slot.linkedShiftKey : slot.key);

const parseDay = (value) => {
    const str = typeof value === 'string' ? value : storageDateStr(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) throw new AssignmentError('Invalid date', 'INVALID_DATE');
    const day = dateOnlyFromStr(str);
    if (Number.isNaN(day.getTime())) throw new AssignmentError('Invalid date', 'INVALID_DATE');
    return day;
};

const slotStartAt = (day, slot) => zonedInstant(storageDateStr(day), slot.startTime);

/** Effective ACM-185 values for a zone's city. */
const settingsFor = async (zoneId) => (await platform()).getControl('driverAssignment', { zoneId });

// ─── Demand: what each cell has to deliver ──────────────────────────────────────────────────────────────────────
const demandByCell = async (day, slotsByKey) => {
    const [orders, pantry] = await Promise.all([
        DMBDailyOrder.aggregate([
            { $match: { deliveryDate: day, status: { $nin: ['skipped', 'failed'] } } },
            { $group: { _id: { zoneId: '$zoneId', slot: '$deliverySlot' }, orders: { $sum: 1 }, tiffins: { $sum: { $reduce: { input: '$meals', initialValue: 0, in: { $add: ['$$value', { $ifNull: ['$$this.quantity', 1] }] } } } } } }
        ]),
        pantryBagsByCell(day)
    ]);
    const cells = new Map();
    const unzoned = { orders: 0, tiffins: 0 };
    const put = (zoneId, slotKey, orderCount, tiffins, bags) => {
        const slot = slotsByKey.get(slotKey);
        if (!slot) return;
        if (!zoneId) { unzoned.orders += orderCount + bags; unzoned.tiffins += tiffins; return; }
        const key = `${zoneId}:${shiftKeyOf(slot)}`;
        const cur = cells.get(key) || { orders: 0, tiffins: 0, bags: 0 };
        cur.orders += orderCount; cur.tiffins += tiffins; cur.bags += bags;
        cells.set(key, cur);
    };
    for (const r of orders) put(r._id.zoneId ? String(r._id.zoneId) : null, r._id.slot, r.orders, r.tiffins, 0);
    for (const r of pantry) put(r.zoneId ? String(r.zoneId) : null, r.slot, 0, 0, r.bags);
    return { cells, unzoned };
};

/** Paid pantry bags due on the day, by the zone of the shop they are collected from. */
const pantryBagsByCell = async (day) => {
    const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const next = addDays(day, 1);
    const rows = await PantryOrder.aggregate([
        { $match: { status: 'paid', 'dailyDeliveries.date': { $gte: day, $lt: next } } },
        { $unwind: '$dailyDeliveries' },
        { $match: { 'dailyDeliveries.date': { $gte: day, $lt: next }, 'dailyDeliveries.status': { $nin: ['skipped', 'failed', 'cancelled'] } } },
        { $group: { _id: { vendorId: '$vendorId', slot: '$dailyDeliveries.slot' }, bags: { $sum: 1 } } }
    ]);
    if (!rows.length) return [];
    const vendors = await FoodRestaurant.find({ _id: { $in: rows.map((r) => r._id.vendorId) } }).select('zoneId').lean();
    const zoneOf = new Map(vendors.map((v) => [String(v._id), v.zoneId || null]));
    return rows.map((r) => ({ zoneId: zoneOf.get(String(r._id.vendorId)) || null, slot: r._id.slot, bags: r.bags }));
};

const assignmentView = (s, driver, zoneId, load = null) => ({
    load,
    shiftId: s._id,
    driverId: s.driverId,
    name: driver?.name || '',
    phone: driver?.phone || '',
    state: s.assignment?.state || 'accepted',
    status: s.status,
    respondBy: s.assignment?.respondBy || null,
    declineReason: s.assignment?.declineReason || '',
    additionalZone: Boolean(driver?.primaryZoneId && String(driver.primaryZoneId) !== String(zoneId))
});

/** Whether a cell can currently deliver: accepted drivers cover it; pending ones are still awaited. */
const cellStatus = ({ demand, assignments }) => {
    const accepted = assignments.filter((a) => a.state === 'accepted').length;
    const pending = assignments.filter((a) => a.state === 'pending').length;
    if (accepted) return 'covered';
    if (pending) return 'awaiting';
    return demand > 0 ? 'uncovered' : 'idle';
};

/**
 * The planning board for a date (normally tomorrow): every active zone x every shift that runs that day, with the work in
 * each cell and the drivers assigned to it.
 */
export const planningBoard = async (dateInput, { cityIds = null } = {}) => {
    const day = parseDay(dateInput);
    const dow = day.getUTCDay();
    const p = await platform();

    let zones = await FoodZone.find({ isActive: true }).select('name zoneName').sort({ name: 1 }).lean();
    if (cityIds?.length) {
        const ids = new Set((await Promise.all(cityIds.map((c) => p.zoneIdsForCity(c)))).flat().map(String));
        zones = zones.filter((z) => ids.has(String(z._id)));
    }
    const slotDocs = await DeliverySlot.find({ isEnabled: true }).select('key name icon color startTime endTime availableDays linkedShiftKey sortOrder').sort({ sortOrder: 1, startTime: 1 }).lean();
    const slotsByKey = new Map(slotDocs.map((s) => [s.key, s]));
    const shiftSlots = slotDocs.filter((s) => shiftKeyOf(s) === s.key && (!s.availableDays?.length || s.availableDays.includes(dow)));

    const zoneIds = zones.map((z) => z._id);
    const [demand, shifts] = await Promise.all([
        demandByCell(day, slotsByKey),
        ShiftRecord.find({ date: day, zoneId: { $in: zoneIds } }).lean()
    ]);
    // What each driver already carries (set by the split at the slot lock, or by an admin move) and which cells are locked.
    const loadRows = await DMBDailyOrder.aggregate([
        { $match: { deliveryDate: day, status: { $nin: ['skipped', 'failed'] }, 'dispatch.deliveryPartnerId': { $ne: null } } },
        { $group: { _id: { zoneId: '$zoneId', slot: '$deliverySlot', driverId: '$dispatch.deliveryPartnerId' }, orders: { $sum: 1 } } }
    ]);
    const loadOf = new Map();
    for (const r of loadRows) {
        const slot = slotsByKey.get(r._id.slot);
        if (!slot) continue;
        const key = `${r._id.zoneId}:${shiftKeyOf(slot)}:${r._id.driverId}`;
        loadOf.set(key, (loadOf.get(key) || 0) + r.orders);
    }
    const { DMBCellPlan } = await import('./cellPlan.model.js');
    const plans = new Map((await DMBCellPlan.find({ date: day }).select('zoneId slotKey lockedAt').lean()).map((pl) => [`${pl.zoneId}:${pl.slotKey}`, pl.lockedAt]));
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: [...new Set(shifts.map((s) => String(s.driverId)))] } }).select('name phone primaryZoneId').lean();
    const driverById = new Map(drivers.map((d) => [String(d._id), d]));

    const cells = [];
    const totals = { orders: 0, tiffins: 0, bags: 0, cells: 0, uncovered: 0, awaiting: 0, covered: 0, drivers: 0 };
    for (const zone of zones) {
        for (const slot of shiftSlots) {
            const d = demand.cells.get(`${zone._id}:${slot.key}`) || { orders: 0, tiffins: 0, bags: 0 };
            const assignments = shifts
                .filter((s) => String(s.zoneId) === String(zone._id) && s.slotKey === slot.key)
                .map((s) => assignmentView(s, driverById.get(String(s.driverId)), zone._id, loadOf.get(`${zone._id}:${slot.key}:${s.driverId}`) || 0));
            const status = cellStatus({ demand: d.orders + d.bags, assignments });
            cells.push({ zoneId: zone._id, slotKey: slot.key, ...d, assignments, status, lockedAt: plans.get(`${zone._id}:${slot.key}`) || null });
            totals.orders += d.orders; totals.tiffins += d.tiffins; totals.bags += d.bags;
            if (status !== 'idle') totals.cells += 1;
            if (status === 'uncovered') totals.uncovered += 1;
            if (status === 'awaiting') totals.awaiting += 1;
            if (status === 'covered') totals.covered += 1;
            totals.drivers += assignments.filter((a) => a.state === 'accepted' || a.state === 'pending').length;
        }
    }
    return {
        date: storageDateStr(day),
        zones: zones.map((z) => ({ _id: z._id, name: z.zoneName || z.name })),
        slots: shiftSlots.map((s) => ({ key: s.key, name: s.name, icon: s.icon, color: s.color, startTime: s.startTime, endTime: s.endTime })),
        cells, totals, unzoned: demand.unzoned
    };
};

/** Drivers who may be assigned to a zone (it is one of their authorised zones), flagged when already booked that slot. */
export const eligibleDrivers = async ({ zoneId, date, slotKey }) => {
    const zid = objectId(zoneId);
    if (!zid) throw new AssignmentError('Invalid zone', 'INVALID_ZONE');
    const drivers = await FoodDeliveryPartner.find({ status: 'approved', zoneIds: zid }).select('name phone primaryZoneId vehicleType').sort({ name: 1 }).lean();
    let booked = new Map();
    if (date && slotKey) {
        const rows = await ShiftRecord.find({ date: parseDay(date), slotKey, driverId: { $in: drivers.map((d) => d._id) }, 'assignment.state': { $in: ['pending', 'accepted'] } }).select('driverId zoneId').lean();
        booked = new Map(rows.map((r) => [String(r.driverId), r.zoneId]));
    }
    return drivers.map((d) => ({
        _id: d._id, name: d.name, phone: d.phone, vehicleType: d.vehicleType || '',
        additionalZone: Boolean(d.primaryZoneId && String(d.primaryZoneId) !== String(zid)),
        bookedElsewhere: booked.has(String(d._id)) && String(booked.get(String(d._id))) !== String(zid),
        alreadyInCell: booked.has(String(d._id)) && String(booked.get(String(d._id))) === String(zid)
    }));
};

const tellDriver = async (driverId, { event, title, body, data = {} }) => {
    try {
        const { notify } = await import('../notifications/notify.js');
        await notify({ to: 'driver', id: driverId, event, title, body, link: '/food/delivery/shifts', data });
    } catch (err) {
        logger.warn(`[assignment] could not notify driver ${driverId}: ${err.message}`);
    }
};

const zoneLabel = async (zoneId) => {
    const z = await FoodZone.findById(zoneId).select('name zoneName').lean();
    return z?.zoneName || z?.name || '';
};

/** Admin assigns a driver to a zone x slot x date. Idempotent per driver: re-assigning a declined/expired one re-asks. */
export const assignDriver = async ({ date, zoneId, slotKey, driverId, adminId = null, now = new Date() }) => {
    const day = parseDay(date);
    const zid = objectId(zoneId);
    const did = objectId(driverId);
    if (!zid || !did) throw new AssignmentError('Zone and driver are required', 'INVALID_INPUT');

    const [zone, driver, slot] = await Promise.all([
        FoodZone.findById(zid).select('name zoneName isActive').lean(),
        FoodDeliveryPartner.findById(did).select('name status zoneIds').lean(),
        DeliverySlot.findOne({ key: String(slotKey || '').toLowerCase(), isEnabled: true }).lean()
    ]);
    if (!zone || !zone.isActive) throw new AssignmentError('Zone not found or inactive', 'INVALID_ZONE');
    if (!driver || driver.status !== 'approved') throw new AssignmentError('Driver not found or not approved', 'INVALID_DRIVER');
    if (!slot) throw new AssignmentError('Slot not found or disabled', 'INVALID_SLOT');
    if (shiftKeyOf(slot) !== slot.key) throw new AssignmentError(`"${slot.name}" is covered by the ${shiftKeyOf(slot)} shift — assign drivers there`, 'LINKED_SLOT');
    if (slot.availableDays?.length && !slot.availableDays.includes(day.getUTCDay())) throw new AssignmentError(`${slot.name} does not run on that day`, 'SLOT_NOT_ON_DAY');
    if (!(driver.zoneIds || []).some((z) => String(z) === String(zid))) throw new AssignmentError(`${driver.name} is not authorised for this zone — add the zone to the driver first`, 'ZONE_NOT_AUTHORISED');
    if (slotStartAt(day, slot) <= now) throw new AssignmentError('That slot has already started', 'SLOT_STARTED');

    const { holidaySetForZone } = await import('../platform/holiday.service.js');
    if ((await holidaySetForZone(zid)).has(storageDateStr(day))) throw new AssignmentError('That day is a platform holiday', 'HOLIDAY');

    const settings = await settingsFor(zid);
    const slotStart = slotStartAt(day, slot);
    // The driver has `responseHours` to answer, but never past the slot start.
    const respondBy = new Date(Math.min(now.getTime() + Number(settings.responseHours) * 3_600_000, slotStart.getTime()));

    const existing = await ShiftRecord.findOne({ driverId: did, date: day, slotKey: slot.key });
    if (existing) {
        const live = ['pending', 'accepted'].includes(existing.assignment?.state);
        if (live && String(existing.zoneId) === String(zid)) return { shift: existing, created: false };
        if (live) throw new AssignmentError(`${driver.name} is already assigned to ${await zoneLabel(existing.zoneId)} for this slot`, 'DRIVER_BOOKED');
        if (existing.checkedInAt) throw new AssignmentError('That driver has already started this shift', 'ALREADY_STARTED');
    }
    const shift = await ShiftRecord.findOneAndUpdate(
        { driverId: did, date: day, slotKey: slot.key },
        {
            $set: {
                zoneId: zid, status: 'scheduled', confirmedAt: null,
                assignment: { state: 'pending', assignedBy: adminId, assignedAt: now, respondBy, respondedAt: null, declineReason: '' },
                unconfirmedAlertSentAt: null, reminder24SentAt: null
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    const { msg } = await import('../../i18n/i18n.service.js');
    await tellDriver(did, {
        event: 'shift_assigned',
        title: msg('New delivery assignment'),
        body: msg('You are assigned to {{zone}} for {{slot}} on {{date}}. Accept or decline in the app.', { zone: zone.zoneName || zone.name, slot: slot.name, date: storageDateStr(day) }),
        data: { shiftId: String(shift._id) }
    });
    return { shift, created: true };
};

/** Admin removes a driver from a cell. A shift the driver already started cannot be removed. */
export const unassignDriver = async ({ shiftId, adminId = null }) => {
    const shift = await ShiftRecord.findById(shiftId);
    if (!shift || !shift.zoneId) throw new AssignmentError('Assignment not found', 'NOT_FOUND', 404);
    if (shift.checkedInAt) throw new AssignmentError('The driver has already started this shift', 'ALREADY_STARTED');
    await shift.deleteOne();
    const { msg } = await import('../../i18n/i18n.service.js');
    await tellDriver(shift.driverId, {
        event: 'shift_unassigned',
        title: msg('Delivery assignment cancelled'),
        body: msg('Your {{slot}} assignment on {{date}} was cancelled.', { slot: shift.slotKey, date: storageDateStr(shift.date) }),
        data: { shiftId: String(shift._id), adminId: adminId ? String(adminId) : '' }
    });
    return { removed: true };
};

/** Copies every live assignment from one day to another (a quick "same as that day" for the next day's plan). */
export const copyAssignments = async ({ fromDate, toDate, adminId = null, now = new Date() }) => {
    const from = parseDay(fromDate);
    const to = parseDay(toDate);
    if (from.getTime() === to.getTime()) throw new AssignmentError('Choose two different days', 'INVALID_INPUT');
    const source = await ShiftRecord.find({ date: from, zoneId: { $ne: null }, 'assignment.state': { $in: ['pending', 'accepted'] } }).lean();
    const result = { copied: 0, skipped: [] };
    for (const s of source) {
        try {
            const r = await assignDriver({ date: to, zoneId: s.zoneId, slotKey: s.slotKey, driverId: s.driverId, adminId, now });
            if (r.created) result.copied += 1;
        } catch (err) {
            if (!(err instanceof AssignmentError)) throw err;
            result.skipped.push({ driverId: s.driverId, slotKey: s.slotKey, zoneId: s.zoneId, reason: err.message });
        }
    }
    return result;
};

const raise = async (alert, zoneId) => {
    const p = await platform();
    const cityId = zoneId ? await p.cityIdForZone(zoneId) : null;
    return p.raiseAdminAlert({ cityId, link: ALERT_LINK, entityType: 'ShiftRecord', ...alert });
};

/** The driver answers an assignment. Accepting makes the shift "confirmed"; declining alerts admin to cover the cell. */
export const respondToAssignment = async (driverId, shiftId, { accept, reason = '' }, now = new Date()) => {
    const shift = await ShiftRecord.findOne({ _id: shiftId, driverId });
    if (!shift || !shift.zoneId) throw new AssignmentError('Assignment not found', 'NOT_FOUND', 404);
    if (shift.assignment?.state !== 'pending') throw new AssignmentError(`This assignment is already ${shift.assignment?.state}`, 'ALREADY_ANSWERED');
    if (shift.assignment.respondBy && shift.assignment.respondBy <= now) throw new AssignmentError('The time to answer this assignment has passed — contact your manager', 'EXPIRED');

    shift.assignment.respondedAt = now;
    if (accept) {
        shift.assignment.state = 'accepted';
        shift.status = 'confirmed';
        shift.confirmedAt = now;
    } else {
        shift.assignment.state = 'declined';
        shift.assignment.declineReason = String(reason || '').slice(0, 300);
        shift.status = 'declined';
    }
    await shift.save();
    if (!accept) await alertCellNeedsDriver(shift, 'assignment_declined', 'declined');
    else await releaseAcceptedCell(shift);
    return shift;
};

/** A newly accepted driver: anything already waiting in the cell is placed and ready pickups go out. Never blocks the answer. */
const releaseAcceptedCell = async (shift) => {
    try {
        const { releaseCell } = await import('./cellPlanner.service.js');
        await releaseCell({ zoneId: shift.zoneId, date: shift.date, slotKey: shift.slotKey });
    } catch (err) {
        logger.warn(`[assignment] releasing cell after acceptance failed: ${err.message}`);
    }
};

const alertCellNeedsDriver = async (shift, type, what) => {
    const driver = await FoodDeliveryPartner.findById(shift.driverId).select('name').lean();
    const zone = await zoneLabel(shift.zoneId);
    await raise({
        type, severity: 'critical',
        title: `${driver?.name || 'A driver'} ${what} ${shift.slotKey} in ${zone}`,
        message: `${driver?.name || 'A driver'} ${what === 'declined' ? 'declined' : 'did not answer'} the ${shift.slotKey} assignment for ${zone} on ${storageDateStr(shift.date)}.${shift.assignment?.declineReason ? ` Reason: ${shift.assignment.declineReason}.` : ''} Assign another driver.`,
        entityId: shift._id, data: { driverId: String(shift.driverId), zoneId: String(shift.zoneId), slotKey: shift.slotKey, date: storageDateStr(shift.date) },
        dedupeKey: `${type}:${shift._id}:${shift.assignment?.assignedAt?.getTime() || 0}`
    }, shift.zoneId);
};

/** Drivers whose acceptance covers a zone x slot x date — the only drivers dispatch may use for it. */
export const acceptedDriversFor = async ({ zoneId, date, slotKey }) => {
    const rows = await ShiftRecord.find({
        date: parseDay(date), zoneId: objectId(zoneId), slotKey,
        'assignment.state': 'accepted', status: { $in: ['confirmed', 'completed'] }
    }).select('driverId').lean();
    return rows.map((r) => r.driverId);
};

/**
 * The drivers a vendor's ready pickup may be offered to: those who accepted an assignment for the vendor's zone on that
 * slot and date. `reason` says why nobody qualifies (the vendor has no zone, or no driver accepted that cell).
 */
export const driversForPickup = async ({ vendor, date, slotKey }) => {
    const zoneId = vendor?.zoneId || vendor?.serviceZone;
    if (!zoneId) return { driverIds: [], reason: 'the vendor has no delivery zone' };
    const slot = await DeliverySlot.findOne({ key: String(slotKey || '').toLowerCase() }).select('key linkedShiftKey').lean();
    const driverIds = await acceptedDriversFor({ zoneId, date, slotKey: slot ? shiftKeyOf(slot) : String(slotKey) });
    if (!driverIds.length) return { driverIds: [], reason: 'no driver accepted an assignment for this zone and slot' };
    return { driverIds, reason: '' };
};

/**
 * Periodic job: expires unanswered assignments, warns about cells with orders but no accepted driver shortly before
 * their slot, and sends the once-a-day reminder of tomorrow's uncovered cells.
 */
export const sweepAssignments = async (now = new Date()) => {
    const out = { expired: 0, uncoveredAlerts: 0, reminders: 0 };
    const { lockDueCells } = await import('./cellPlanner.service.js');
    out.locked = (await lockDueCells(now)).locked;

    const stale = await ShiftRecord.find({ zoneId: { $ne: null }, 'assignment.state': 'pending', 'assignment.respondBy': { $lte: now } });
    for (const shift of stale) {
        shift.assignment.state = 'expired';
        shift.status = 'expired';
        await shift.save();
        await alertCellNeedsDriver(shift, 'assignment_expired', 'did not answer');
        out.expired += 1;
    }

    const today = localToday(now);
    for (const day of [today, addDays(today, 1)]) {
        const board = await planningBoard(day);
        const slotByKey = new Map(board.slots.map((s) => [s.key, s]));
        for (const cell of board.cells) {
            if (cell.status !== 'uncovered' && cell.status !== 'awaiting') continue;
            const slot = slotByKey.get(cell.slotKey);
            const startAt = slotStartAt(day, slot);
            if (startAt <= now) continue;
            const settings = await settingsFor(cell.zoneId);
            if (startAt.getTime() - now.getTime() > Number(settings.noCoverageAlertHours) * 3_600_000) continue;
            const zone = board.zones.find((z) => String(z._id) === String(cell.zoneId));
            const res = await raise({
                type: 'zone_slot_uncovered', severity: 'critical',
                title: `No driver for ${zone?.name} - ${slot.name}`,
                message: `${cell.orders + cell.bags} delivery(ies) in ${zone?.name} for ${slot.name} on ${board.date} have no accepted driver and the slot starts at ${slot.startTime}.`,
                entityType: 'Zone', entityId: cell.zoneId, data: { zoneId: String(cell.zoneId), slotKey: cell.slotKey, date: board.date },
                dedupeKey: `uncovered:${cell.zoneId}:${cell.slotKey}:${board.date}`
            }, cell.zoneId);
            if (res.created) out.uncoveredAlerts += 1;
        }
    }

    // Daily planning reminder: once a city's reminder time has passed, tomorrow's uncovered cells are listed for admin.
    const tomorrow = addDays(today, 1);
    const board = await planningBoard(tomorrow);
    const uncovered = board.cells.filter((c) => c.status === 'uncovered');
    if (uncovered.length) {
        const byCity = new Map();
        const p = await platform();
        for (const c of uncovered) {
            const cityId = (await p.cityIdForZone(c.zoneId)) || null;
            const key = String(cityId);
            byCity.set(key, { cityId, zoneId: c.zoneId, cells: [...(byCity.get(key)?.cells || []), c] });
        }
        for (const { cityId, zoneId, cells } of byCity.values()) {
            const settings = await settingsFor(zoneId);
            if (localTimeHHMM(now) < settings.planningReminderTime) continue;
            const res = await raise({
                type: 'planning_incomplete', severity: 'warning',
                title: `Tomorrow's driver plan is incomplete (${cells.length} zone/slot cells)`,
                message: `${cells.length} zone/slot cell(s) with deliveries for ${board.date} have no driver assigned yet.`,
                entityType: 'Planning', entityId: board.date, data: { date: board.date, cells: cells.length, cityId: cityId ? String(cityId) : null },
                dedupeKey: `planning:${board.date}:${cityId || 'none'}:${localDateStr(now)}`
            }, zoneId);
            if (res.created) out.reminders += 1;
        }
    }
    return out;
};
