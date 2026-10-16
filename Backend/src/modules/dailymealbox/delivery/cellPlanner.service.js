import mongoose from 'mongoose';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { DeliverySlot } from '../deliverySlot/deliverySlot.model.js';
import { ShiftRecord } from '../../food/delivery/models/shiftRecord.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { CollectionBatch } from './collectionBatch.model.js';
import { DMBCellPlan } from './cellPlan.model.js';
import { shiftKeyOf, acceptedDriversFor, AssignmentError } from './driverAssignment.service.js';
import crypto from 'crypto';
import { logger } from '../../../utils/logger.js';
import { localToday, storageDateStr, zonedInstant, addDays } from '../../../utils/platformTime.js';

/**
 * Stage B of dispatch — turning a zone x slot x date plus its accepted drivers into who delivers what.
 *
 * "Units" are the things to deliver: a subscription meal order or a paid pantry bag. Units of the same customer at the same
 * address form ONE stop and always go to the same driver. The split is deterministic and respects what is already placed
 * (admin moves, earlier splits): only units with no driver — or whose driver is no longer accepted for the cell — are placed.
 */

const OPEN_STATUSES = ['scheduled', 'preparing', 'ready'];

const day = (v) => (typeof v === 'string' ? new Date(`${v}T00:00:00.000Z`) : new Date(v));

/** All delivery-slot keys served by one shift (the shift's own key plus slots linked to it). */
const slotKeysOfShift = async (shiftKey) => {
    const slots = await DeliverySlot.find({}).select('key linkedShiftKey').lean();
    return [...new Set([shiftKey, ...slots.filter((s) => shiftKeyOf(s) === shiftKey).map((s) => s.key)])];
};

const coordsOf = (address) => {
    const c = address?.location?.coordinates;
    return Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]) ? { lng: c[0], lat: c[1] } : null;
};
const stopKey = (userId, c) => `${userId}:${c ? `${c.lat.toFixed(4)},${c.lng.toFixed(4)}` : 'nocoords'}`;

/** Every unit in a cell (meals and pantry bags), whatever its state. */
export const cellUnits = async ({ zoneId, date, slotKey }) => {
    const d = day(date);
    const keys = await slotKeysOfShift(slotKey);
    const [orders, vendors] = await Promise.all([
        DMBDailyOrder.find({ zoneId, deliveryDate: d, deliverySlot: { $in: keys }, status: { $nin: ['skipped', 'failed'] } })
            .select('userId vendorId meals deliveryAddress status deliverySlot dispatch orderId deliveryPin bundleId').lean(),
        FoodRestaurant.find({ zoneId }).select('_id').lean()
    ]);
    const next = addDays(d, 1);
    const pantry = vendors.length
        ? await PantryOrder.find({ status: 'paid', vendorId: { $in: vendors.map((v) => v._id) }, dailyDeliveries: { $elemMatch: { date: { $gte: d, $lt: next }, slot: { $in: keys } } } }).lean()
        : [];

    const units = [];
    for (const o of orders) {
        const c = coordsOf(o.deliveryAddress);
        units.push({
            kind: 'meal', id: String(o._id), label: o.orderId, vendorId: String(o.vendorId), slot: o.deliverySlot, status: o.status,
            driverId: o.dispatch?.deliveryPartnerId ? String(o.dispatch.deliveryPartnerId) : null,
            weight: (o.meals || []).reduce((s, m) => s + (Number(m.quantity) || 1), 0) || 1,
            lat: c?.lat ?? null, lng: c?.lng ?? null, key: stopKey(o.userId, c), area: o.deliveryAddress?.street || '',
            pin: o.deliveryPin || '', bundleId: o.bundleId || ''
        });
    }
    for (const po of pantry) {
        const c = coordsOf(po.deliveryAddress);
        for (const dd of po.dailyDeliveries) {
            if (!keys.includes(dd.slot) || dd.date < d || dd.date >= next || ['delivered', 'failed'].includes(dd.status)) continue;
            units.push({
                kind: 'pantry', id: String(dd._id), label: po.orderId, vendorId: String(po.vendorId), slot: dd.slot, status: dd.status,
                driverId: dd.driverId ? String(dd.driverId) : null, weight: 1,
                lat: c?.lat ?? null, lng: c?.lng ?? null, key: stopKey(po.userId, c), area: po.deliveryAddress?.street || '',
                pin: dd.deliveryPin || '', bundleId: dd.bundleId || ''
            });
        }
    }
    return units;
};

const dist = (a, b) => Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));

/** Orders stops into one geographic chain: start at the stop farthest from the centre, then always the nearest next. */
const chainOf = (stops) => {
    const located = stops.filter((s) => s.lat !== null);
    const unlocated = stops.filter((s) => s.lat === null);
    if (located.length < 2) return [...located, ...unlocated];
    const cx = located.reduce((s, x) => s + x.lat, 0) / located.length;
    const cy = located.reduce((s, x) => s + x.lng, 0) / located.length;
    const rest = [...located].sort((a, b) => a.key.localeCompare(b.key));
    let cur = rest.reduce((best, s) => (dist(s, { lat: cx, lng: cy }) > dist(best, { lat: cx, lng: cy }) ? s : best), rest[0]);
    const out = [];
    rest.splice(rest.indexOf(cur), 1);
    out.push(cur);
    while (rest.length) {
        cur = rest.reduce((best, s) => (dist(s, out[out.length - 1]) < dist(best, out[out.length - 1]) ? s : best), rest[0]);
        rest.splice(rest.indexOf(cur), 1);
        out.push(cur);
    }
    return [...out, ...unlocated];
};

/**
 * Pure: places `stops` on `driverIds` so every driver ends near an equal share of the total weight, giving each driver a
 * contiguous stretch of the geographic chain. `loads` is the weight each driver already carries.
 */
export const splitStops = (stops, driverIds, loads = {}) => {
    const out = new Map(driverIds.map((d) => [d, []]));
    if (!stops.length) return out;
    if (driverIds.length === 1) { out.get(driverIds[0]).push(...stops); return out; }
    const total = stops.reduce((s, x) => s + x.weight, 0) + driverIds.reduce((s, d) => s + (loads[d] || 0), 0);
    const target = total / driverIds.length;
    const room = driverIds.map((d) => Math.max(0, target - (loads[d] || 0)));
    let i = 0;
    for (const stop of chainOf(stops)) {
        while (i < driverIds.length - 1 && room[i] <= 0) i += 1;
        out.get(driverIds[i]).push(stop);
        room[i] -= stop.weight;
    }
    return out;
};

const persistPlacement = async (placements) => {
    for (const [driverId, units] of placements) {
        const meals = units.filter((u) => u.kind === 'meal').map((u) => u.id);
        const bags = units.filter((u) => u.kind === 'pantry').map((u) => new mongoose.Types.ObjectId(u.id));
        if (meals.length) await DMBDailyOrder.updateMany({ _id: { $in: meals } }, { $set: { 'dispatch.deliveryPartnerId': driverId } });
        if (bags.length) {
            await PantryOrder.updateMany(
                { 'dailyDeliveries._id': { $in: bags } },
                { $set: { 'dailyDeliveries.$[d].driverId': driverId } },
                { arrayFilters: [{ 'd._id': { $in: bags } }] }
            );
        }
    }
};

/**
 * One stop = one doorbell: units of the same customer at the same address share a bundle id and ONE delivery PIN. The PIN is
 * the one the group already shares (so a customer is never given a new number needlessly), else the first member's.
 * Idempotent; a unit alone at its address is not a bundle.
 */
const assignBundles = async (units, { date, slotKey }) => {
    const groups = new Map();
    for (const u of units) {
        if (!OPEN_STATUSES.includes(u.status)) continue;
        const g = groups.get(u.key) || [];
        g.push(u);
        groups.set(u.key, g);
    }
    const dateStr = storageDateStr(day(date));
    const mealWrites = [];
    const bagWrites = [];
    for (const [key, members] of groups) {
        const bundleId = members.length > 1 ? `BND-${dateStr}-${slotKey}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)}` : '';
        const shared = members.find((m) => m.bundleId === bundleId && m.pin)?.pin || [...members].sort((a, b) => a.id.localeCompare(b.id)).find((m) => m.pin)?.pin || '';
        for (const m of members) {
            const wantPin = bundleId && shared ? shared : m.pin;
            if (m.bundleId === bundleId && m.pin === wantPin) continue;
            (m.kind === 'meal' ? mealWrites : bagWrites).push({ id: m.id, bundleId, pin: wantPin });
        }
    }
    if (mealWrites.length) {
        await DMBDailyOrder.bulkWrite(mealWrites.map((w) => ({ updateOne: { filter: { _id: w.id }, update: { $set: { bundleId: w.bundleId, ...(w.pin ? { deliveryPin: w.pin } : {}) } } } })));
    }
    for (const w of bagWrites) {
        await PantryOrder.updateOne(
            { 'dailyDeliveries._id': new mongoose.Types.ObjectId(w.id) },
            { $set: { 'dailyDeliveries.$[d].bundleId': w.bundleId, ...(w.pin ? { 'dailyDeliveries.$[d].deliveryPin': w.pin } : {}) } },
            { arrayFilters: [{ 'd._id': new mongoose.Types.ObjectId(w.id) }] }
        );
    }
    return { bundles: [...groups.values()].filter((g) => g.length > 1).length };
};

/**
 * Places every open unit of the cell that has no accepted driver yet. Idempotent. Returns who got how much.
 */
export const splitCell = async ({ zoneId, date, slotKey }) => {
    const accepted = (await acceptedDriversFor({ zoneId, date, slotKey })).map(String).sort();
    const units = await cellUnits({ zoneId, date, slotKey });
    const open = units.filter((u) => OPEN_STATUSES.includes(u.status) && (!u.driverId || !accepted.includes(u.driverId)));
    // Bundles are formed for every cell with work, even before drivers accept, so a customer's PIN is stable from the start.
    await assignBundles(units, { date, slotKey });
    // Items whose vendor is in another zone get a hub transfer (and a source driver) now; the zone driver is filled in below.
    const hub = await import('./hub.service.js');
    await hub.createTransfersForCell({ zoneId, date, slotKey, units });
    if (!accepted.length) return { drivers: [], placed: 0, unplaced: open.length };
    if (!open.length) return { drivers: accepted, placed: 0, unplaced: 0 };

    const loads = {};
    for (const u of units) if (u.driverId && accepted.includes(u.driverId) && !open.includes(u)) loads[u.driverId] = (loads[u.driverId] || 0) + u.weight;

    const byStop = new Map();
    for (const u of open) {
        const s = byStop.get(u.key) || { key: u.key, units: [], weight: 0, lat: u.lat, lng: u.lng };
        s.units.push(u); s.weight += u.weight;
        byStop.set(u.key, s);
    }
    const placements = splitStops([...byStop.values()], accepted, loads);
    await persistPlacement(new Map([...placements].map(([d, stops]) => [d, stops.flatMap((s) => s.units)])));
    await hub.syncZoneDrivers([...placements].flatMap(([d, stops]) => stops.flatMap((s) => s.units.map((u) => ({ ...u, driverId: d })))));
    return { drivers: accepted, placed: open.length, unplaced: 0, perDriver: Object.fromEntries([...placements].map(([d, s]) => [d, s.reduce((a, x) => a + x.weight, 0)])) };
};

const slotLockAt = (slot, dateStr) => {
    const start = zonedInstant(dateStr, slot.startTime);
    return new Date(start.getTime() - (Number(slot.orderCutoffHours) || 0) * 3_600_000);
};

/** Locks every accepted cell of today and tomorrow whose slot cutoff has passed: splits its orders between the drivers. */
export const lockDueCells = async (now = new Date()) => {
    await DMBCellPlan.init();
    const today = localToday(now);
    const shifts = await ShiftRecord.find({
        date: { $gte: today, $lte: addDays(today, 1) }, zoneId: { $ne: null }, 'assignment.state': 'accepted', status: { $in: ['confirmed', 'completed'] }
    }).select('date zoneId slotKey').lean();
    const cells = new Map(shifts.map((s) => [`${storageDateStr(s.date)}:${s.zoneId}:${s.slotKey}`, s]));
    const slots = new Map((await DeliverySlot.find({ key: { $in: [...new Set(shifts.map((s) => s.slotKey))] } }).lean()).map((s) => [s.key, s]));
    const out = { locked: 0 };
    for (const s of cells.values()) {
        const slot = slots.get(s.slotKey);
        if (!slot || slotLockAt(slot, storageDateStr(s.date)) > now) continue;
        if (await DMBCellPlan.exists({ date: s.date, zoneId: s.zoneId, slotKey: s.slotKey })) continue;
        const res = await splitCell({ zoneId: s.zoneId, date: s.date, slotKey: s.slotKey });
        await DMBCellPlan.updateOne(
            { date: s.date, zoneId: s.zoneId, slotKey: s.slotKey },
            { $setOnInsert: { lockedAt: now, split: Object.entries(res.perDriver || {}).map(([driverId, weight]) => ({ driverId, weight })) } },
            { upsert: true }
        );
        out.locked += 1;
    }
    return out;
};

/** A driver accepted (or a late order arrived): place what is unplaced and send ready pickups to the right drivers. */
export const releaseCell = async ({ zoneId, date, slotKey }) => {
    // Before the cell is locked and while nothing is ready the split must wait: whoever accepts first must not take
    // everything, and a driver who accepts later must still get a fair share when the cell is split.
    const units = await cellUnits({ zoneId, date, slotKey });
    const locked = await DMBCellPlan.exists({ date: day(date), zoneId, slotKey });
    if (!locked && !units.some((u) => u.status === 'ready')) return { drivers: [], placed: 0, unplaced: 0, waiting: true };
    const res = await splitCell({ zoneId, date, slotKey });
    if (!res.drivers.length) return res;
    const { triggerDriverNotificationIfAllReady } = await import('../subscription/dmb.dailyOrder.service.js');
    const ready = await cellUnits({ zoneId, date, slotKey });
    const pairs = new Map(ready.filter((u) => u.status === 'ready').map((u) => [`${u.vendorId}:${u.slot}`, u]));
    for (const u of pairs.values()) {
        try { await triggerDriverNotificationIfAllReady(u.vendorId, date, u.slot); } catch (err) { logger.warn(`[planner] release for vendor ${u.vendorId} failed: ${err.message}`); }
    }
    return res;
};

/** Admin view of one cell: every unit, who carries it, and which drivers it can be moved to. */
export const cellDetail = async ({ zoneId, date, slotKey }) => {
    const [units, accepted] = await Promise.all([cellUnits({ zoneId, date, slotKey }), acceptedDriversFor({ zoneId, date, slotKey })]);
    const drivers = await FoodDeliveryPartner.find({ _id: { $in: accepted } }).select('name phone').lean();
    const vendors = await FoodRestaurant.find({ _id: { $in: [...new Set(units.map((u) => u.vendorId))] } }).select('restaurantName').lean();
    const vendorName = new Map(vendors.map((v) => [String(v._id), v.restaurantName]));
    const plan = await DMBCellPlan.findOne({ date: day(date), zoneId, slotKey }).lean();
    return {
        lockedAt: plan?.lockedAt || null,
        drivers: drivers.map((d) => ({ _id: d._id, name: d.name, phone: d.phone, load: units.filter((u) => u.driverId === String(d._id)).reduce((s, u) => s + u.weight, 0), stops: new Set(units.filter((u) => u.driverId === String(d._id)).map((u) => u.key)).size })),
        units: units.map((u) => ({ kind: u.kind, id: u.id, label: u.label, vendor: vendorName.get(u.vendorId) || '', slot: u.slot, status: u.status, weight: u.weight, area: u.area, driverId: u.driverId, movable: OPEN_STATUSES.includes(u.status) }))
    };
};

/** Admin moves one unit to another accepted driver of the same cell (only before it is collected). */
export const moveUnit = async ({ kind, id, toDriverId }) => {
    let zoneId; let date; let slotKey; let vendorId; let slot; let status;
    if (kind === 'meal') {
        const o = await DMBDailyOrder.findById(id).select('zoneId deliveryDate deliverySlot vendorId status').lean();
        if (!o) throw new AssignmentError('Order not found', 'NOT_FOUND', 404);
        ({ zoneId, deliveryDate: date, deliverySlot: slot, vendorId, status } = o);
    } else if (kind === 'pantry') {
        const po = await PantryOrder.findOne({ 'dailyDeliveries._id': id }).lean();
        if (!po) throw new AssignmentError('Pantry bag not found', 'NOT_FOUND', 404);
        const dd = po.dailyDeliveries.find((x) => String(x._id) === String(id));
        const v = await FoodRestaurant.findById(po.vendorId).select('zoneId').lean();
        ({ zoneId } = v || {}); date = dd.date; slot = dd.slot; vendorId = po.vendorId; status = dd.status;
    } else throw new AssignmentError('Unknown kind', 'INVALID_INPUT');
    if (!OPEN_STATUSES.includes(status)) throw new AssignmentError('This delivery is already with a driver and cannot be moved', 'NOT_MOVABLE');

    const slotDef = await DeliverySlot.findOne({ key: slot }).select('key linkedShiftKey').lean();
    slotKey = slotDef ? shiftKeyOf(slotDef) : slot;
    const accepted = (await acceptedDriversFor({ zoneId, date, slotKey })).map(String);
    if (!accepted.includes(String(toDriverId))) throw new AssignmentError('That driver has not accepted this zone and slot', 'DRIVER_NOT_IN_CELL');

    // A bundle is one stop with one doorbell: it moves as a whole, never split between two drivers.
    const cellUnitsNow = await cellUnits({ zoneId, date, slotKey });
    const self = cellUnitsNow.find((u) => u.id === String(id));
    const moving = (self?.bundleId ? cellUnitsNow.filter((u) => u.bundleId === self.bundleId && OPEN_STATUSES.includes(u.status)) : [])
        .map((u) => ({ kind: u.kind, id: u.id, vendorId: u.vendorId, slot: u.slot, status: u.status }));
    if (!moving.length) moving.push({ kind, id: String(id), vendorId: String(vendorId), slot, status });
    await persistPlacement(new Map([[String(toDriverId), moving.map((m) => ({ kind: m.kind, id: m.id }))]]));

    // Items may already sit in the previous driver's pickup batch: take them out and (re)issue the new driver's pickup.
    const previous = new Set();
    for (const m of moving) {
        const batches = await CollectionBatch.find({ vendorId: m.vendorId, deliveryDate: date, deliverySlot: m.slot, status: { $in: ['pending', 'driver_assigned', 'driver_en_route'] }, orderIds: new mongoose.Types.ObjectId(String(m.id)) });
        for (const b of batches) {
            if (String(b.driverId) === String(toDriverId)) continue;
            if (b.driverId) previous.add(String(b.driverId));
            b.orderIds = b.orderIds.filter((x) => String(x) !== String(m.id));
            b.boxCount = b.orderIds.length;
            if (!b.orderIds.length) await b.deleteOne(); else await b.save();
        }
    }
    const { triggerDriverNotificationIfAllReady, notifyDriverOfRouteUpdate } = await import('../subscription/dmb.dailyOrder.service.js');
    const readyPairs = new Map(moving.filter((m) => m.status === 'ready').map((m) => [`${m.vendorId}:${m.slot}`, m]));
    for (const m of readyPairs.values()) await triggerDriverNotificationIfAllReady(m.vendorId, date, m.slot);
    notifyDriverOfRouteUpdate(toDriverId);
    for (const p of previous) notifyDriverOfRouteUpdate(p);
    return { moved: true, count: moving.length };
};
