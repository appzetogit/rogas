import crypto from 'crypto';
import mongoose from 'mongoose';
import { DMBHubTransfer } from './hub.models.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { DeliverySlot } from '../deliverySlot/deliverySlot.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { CollectionBatch } from './collectionBatch.model.js';
import { cityIdForZone, getControl, raiseAdminAlert } from '../platform/platformConfig.service.js';
import { acceptedDriversFor } from './driverAssignment.service.js';
import { encryptField, safeDecrypt } from '../../../utils/fieldCrypto.js';
import { logger } from '../../../utils/logger.js';
import { storageDateStr, localToday, addDays } from '../../../utils/platformTime.js';

/**
 * Hubs: how an item crosses a zone boundary without any driver leaving their zone.
 *
 *   source driver (the vendor's zone) collects at the vendor  →  drops at the hub with PIN 1  →  hub operator holds it
 *   hub operator gives PIN 2 to the customer's-zone driver     →  zone driver collects at the hub  →  delivers (one visit)
 *
 * PIN 1 belongs to the transfer from the start but only works once the source driver has collected the item (it then lives for
 * `dropPinHours`). PIN 2 is generated only after PIN 1 succeeds. Both are stored hashed + encrypted, three wrong attempts lock a
 * PIN and alert admin.
 */

export class HubError extends Error {
    constructor(message, code = 'HUB_ERROR', statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}

const MAX_PIN_ATTEMPTS = 3;
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const hhmmToMin = (s) => {
    const m = /^(\d{2}):(\d{2})$/.exec(String(s || ''));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

// ─── PINs ───────────────────────────────────────────────────────────────────────────────────────────────────
const newPin = () => String(crypto.randomInt(1000, 10000));
const pinHash = (transferId, pin) => crypto.createHash('sha256').update(`${transferId}:${String(pin).trim()}`).digest('hex');
const readPin = (enc) => safeDecrypt(enc) || '';
const sameHash = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// ─── Settings & geometry ────────────────────────────────────────────────────────────────────────────────────
export const hubSettings = async (zoneId) => getControl('hubOperations', { zoneId });
export const crossZoneSettings = async (zoneId) => getControl('crossZoneDelivery', { zoneId });

const pointOf = (loc) => {
    if (!loc) return null;
    if (Array.isArray(loc.coordinates) && loc.coordinates.length === 2) return { lat: Number(loc.coordinates[1]), lng: Number(loc.coordinates[0]) };
    if (Number.isFinite(Number(loc.latitude)) && Number.isFinite(Number(loc.longitude))) return { lat: Number(loc.latitude), lng: Number(loc.longitude) };
    return null;
};
const km = (a, b) => {
    const R = 6371;
    const dLat = ((b.lat - a.lat) * Math.PI) / 180;
    const dLng = ((b.lng - a.lng) * Math.PI) / 180;
    const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
};

/** The hub of the customer's zone nearest to the vendor, or null. */
export const pickHub = async ({ zoneId, vendor }) => {
    const hubs = await FoodRestaurant.find({ isHub: true, status: 'approved', zoneId: oid(zoneId) }).select('restaurantName location zoneId addressLine1 phone hubCapacity hubActiveHours hubOperatorName').lean();
    if (!hubs.length) return null;
    const from = pointOf(vendor?.location);
    if (!from) return hubs[0];
    return [...hubs].sort((a, b) => (pointOf(a.location) ? km(from, pointOf(a.location)) : 1e9) - (pointOf(b.location) ? km(from, pointOf(b.location)) : 1e9))[0];
};

/**
 * Can this vendor's food reach the customer's zone through a hub for this slot? Used at checkout: when it cannot, the customer
 * gets the reason and chooses another slot. The food is ready after the slot's prep time; the source driver then has to
 * reach the hub before (zone drivers' start - buffer).
 */
export const crossZoneFeasibility = async ({ vendor, customerZoneId, slotKey }) => {
    const cfg = await crossZoneSettings(customerZoneId);
    if (!cfg.enabled) return { ok: false, code: 'CROSS_ZONE_DISABLED', reason: 'Ordering from another zone is not available in your area' };
    const hub = await pickHub({ zoneId: customerZoneId, vendor });
    if (!hub) return { ok: false, code: 'NO_HUB', reason: 'There is no hub in your zone yet, so this maker cannot deliver to you' };
    const slot = await DeliverySlot.findOne({ key: String(slotKey).toLowerCase() }).lean();
    const driverStart = hhmmToMin(slot?.driverStartTime);
    if (driverStart === null) return { ok: false, code: 'SLOT_NOT_CONFIGURED', reason: 'This slot cannot carry deliveries from another zone yet' };
    const ops = await hubSettings(customerZoneId);
    const from = pointOf(vendor?.location);
    const to = pointOf(hub.location);
    if (!from || !to) return { ok: false, code: 'NO_LOCATION', reason: 'The maker or the hub has no map location' };
    const readyAt = (hhmmToMin(slot.startTime) ?? 0) + (Number(slot.maxPrepMinutes) || 0);
    const travel = Math.ceil((km(from, to) / Number(ops.travelSpeedKmh)) * 60);
    const deadline = driverStart - Number(ops.handoffBufferMinutes);
    if (readyAt + travel > deadline) return { ok: false, code: 'TOO_LATE', reason: 'The food from this maker cannot reach the hub in time for this slot - choose a later slot' };
    return { ok: true, hub, surchargePln: Number(cfg.surchargePln) || 0, handoffDeadlineMinutes: deadline, travelMinutes: travel };
};

// ─── Creating transfers ─────────────────────────────────────────────────────────────────────────────────────
const alertOnce = (args) => raiseAdminAlert({ link: '/admin/food/delivery-partners/hubs', ...args }).catch(() => {});

const itemsOf = (order) => (order.meals || []).map((m) => ({ description: m.name || 'Meal', quantity: m.quantity || 1 }));

/** The source-zone driver with the fewest transfers that day: the one who carries the next cross-zone item. */
const pickSourceDriver = async ({ sourceZoneId, date, slotKey }) => {
    const accepted = await acceptedDriversFor({ zoneId: sourceZoneId, date, slotKey });
    if (!accepted.length) return null;
    const loads = await DMBHubTransfer.aggregate([{ $match: { date: new Date(storageDateStr(date) + 'T00:00:00.000Z'), sourceDriverId: { $in: accepted } } }, { $group: { _id: '$sourceDriverId', n: { $sum: 1 } } }]);
    const load = new Map(loads.map((l) => [String(l._id), l.n]));
    return [...accepted].sort((a, b) => (load.get(String(a)) || 0) - (load.get(String(b)) || 0) || String(a).localeCompare(String(b)))[0];
};

/**
 * For a customer-zone cell: every open item whose vendor is in ANOTHER zone gets a hub transfer (idempotent). Returns
 * { created, blocked: [{ unitId, reason }] }; a blocked item is retried at the next split and an alert is raised.
 */
let transferIndexReady = null;
/** One transfer per item is a unique index: make sure it exists before two splits can race to create it. */
const transfersReady = () => (transferIndexReady ||= DMBHubTransfer.init().catch((err) => { transferIndexReady = null; throw err; }));

export const createTransfersForCell = async ({ zoneId, date, slotKey, units }) => {
    await transfersReady();
    const out = { created: 0, blocked: [] };
    if (!(await crossZoneSettings(zoneId)).enabled) return out; // the switch is off here: vendors keep delivering the way they did
    const day = new Date(storageDateStr(date) + 'T00:00:00.000Z');
    const open = units.filter((u) => u.kind === 'meal' && ['scheduled', 'preparing', 'ready'].includes(u.status));
    if (!open.length) return out;
    const vendors = new Map((await FoodRestaurant.find({ _id: { $in: [...new Set(open.map((u) => u.vendorId))] } }).select('zoneId location restaurantName').lean()).map((v) => [String(v._id), v]));
    const cross = open.filter((u) => vendors.get(u.vendorId)?.zoneId && String(vendors.get(u.vendorId).zoneId) !== String(zoneId));
    if (!cross.length) return out;
    const existing = new Set((await DMBHubTransfer.find({ unitKind: 'meal', unitId: { $in: cross.map((u) => oid(u.id)) } }).select('unitId').lean()).map((t) => String(t.unitId)));
    const ops = await hubSettings(zoneId);
    const dropped = (await DMBDailyOrder.find({ _id: { $in: cross.map((u) => oid(u.id)) } }).select('meals dispatch').lean());
    const orderById = new Map(dropped.map((o) => [String(o._id), o]));
    for (const u of cross) {
        if (existing.has(u.id)) continue;
        const vendor = vendors.get(u.vendorId);
        const hub = await pickHub({ zoneId, vendor });
        if (!hub) { out.blocked.push({ unitId: u.id, reason: 'no_hub' }); await alertOnce({ type: 'hub_missing', severity: 'critical', title: 'No hub for a cross-zone delivery', message: `A delivery from ${vendor.restaurantName} to this zone has no hub to pass through.`, entityType: 'Zone', entityId: String(zoneId), cityId: await cityIdForZone(zoneId), dedupeKey: `hubmissing:${zoneId}:${storageDateStr(day)}:${slotKey}` }); continue; }
        const capacity = Number(hub.hubCapacity) || Number(ops.defaultCapacity);
        const holding = await DMBHubTransfer.countDocuments({ hubVendorId: hub._id, date: day, slotKey, status: { $in: ['pending_drop', 'holding'] } });
        if (holding >= capacity) { out.blocked.push({ unitId: u.id, reason: 'hub_full' }); await alertOnce({ type: 'hub_full', severity: 'warning', title: `${hub.restaurantName} is full`, message: `The hub already has ${holding} items for ${slotKey} on ${storageDateStr(day)} (capacity ${capacity}).`, entityType: 'FoodRestaurant', entityId: String(hub._id), cityId: await cityIdForZone(zoneId), dedupeKey: `hubfull:${hub._id}:${storageDateStr(day)}:${slotKey}` }); continue; }
        const sourceZoneId = vendor.zoneId;
        const sourceDriverId = await pickSourceDriver({ sourceZoneId, date, slotKey });
        if (!sourceDriverId) { out.blocked.push({ unitId: u.id, reason: 'no_source_driver' }); await alertOnce({ type: 'hub_source_driver_missing', severity: 'critical', title: 'No driver to carry an item to the hub', message: `Nobody accepted ${slotKey} in the zone of ${vendor.restaurantName}, so its item cannot be taken to the hub.`, entityType: 'Zone', entityId: String(sourceZoneId), cityId: await cityIdForZone(sourceZoneId), dedupeKey: `hubsrc:${sourceZoneId}:${storageDateStr(day)}:${slotKey}` }); continue; }
        const _id = new mongoose.Types.ObjectId();
        const pin = newPin();
        try {
            await DMBHubTransfer.create({
                _id, unitKind: 'meal', unitId: oid(u.id), hubVendorId: hub._id, sourceVendorId: vendor._id, sourceZoneId, destZoneId: oid(zoneId), date: day, slotKey,
                sourceDriverId, zoneDriverId: orderById.get(u.id)?.dispatch?.deliveryPartnerId || null, items: itemsOf(orderById.get(u.id) || {}),
                dropPinHash: pinHash(_id, pin), dropPinEnc: encryptField(pin), status: 'pending_drop'
            });
        } catch (err) {
            if (err?.code === 11000) continue; // another split created it first
            throw err;
        }
        await DMBDailyOrder.updateOne({ _id: u.id }, { $set: { hasCrossZone: true } });
        out.created += 1;
    }
    return out;
};

/** After the customer-zone cell has placed its items on drivers: tell every open transfer who the zone driver is. */
export const syncZoneDrivers = async (units) => {
    for (const u of units.filter((x) => x.kind === 'meal' && x.driverId)) {
        await DMBHubTransfer.updateOne({ unitKind: 'meal', unitId: oid(u.id), status: { $in: ['pending_drop', 'holding'] }, zoneDriverId: { $ne: oid(u.driverId) } }, { $set: { zoneDriverId: oid(u.driverId) } });
    }
};

/** The units of a vendor's pickup that must go to a hub, by unit id. */
export const transfersByUnit = async (unitIds) => {
    if (!unitIds.length) return new Map();
    const rows = await DMBHubTransfer.find({ unitKind: 'meal', unitId: { $in: unitIds.map(oid) }, status: { $in: ['pending_drop', 'holding'] } }).lean();
    return new Map(rows.map((t) => [String(t.unitId), t]));
};

/** The source driver collected the vendor's batch: its hub items are now in transit, and PIN 1 starts to live. */
export const markCollectedForHub = async ({ unitIds, driverId, now = new Date() }) => {
    const transfers = await DMBHubTransfer.find({ unitKind: 'meal', unitId: { $in: unitIds.map(oid) }, status: 'pending_drop' }).lean();
    if (!transfers.length) return [];
    const ops = await hubSettings(transfers[0].sourceZoneId);
    const expires = new Date(now.getTime() + Number(ops.dropPinHours) * 3_600_000);
    await DMBHubTransfer.updateMany({ _id: { $in: transfers.map((t) => t._id) } }, { $set: { sourceDriverId: oid(driverId), dropPinExpiresAt: expires } });
    await DMBDailyOrder.updateMany({ _id: { $in: transfers.map((t) => t.unitId) } }, { $set: { status: 'hub_transit', pickedUpAt: now } });
    return transfers.map((t) => String(t.unitId));
};

// ─── PIN 1: the source driver hands the item to the hub ─────────────────────────────────────────────────────
const lockAndAlert = async (transfer, which) => {
    await alertOnce({
        type: 'hub_pin_locked', severity: 'warning', cityId: await cityIdForZone(transfer.destZoneId),
        title: `Hub ${which === 'drop' ? 'drop-off' : 'pickup'} PIN locked`, message: `A wrong PIN was entered ${MAX_PIN_ATTEMPTS} times at the hub. Generate a new PIN to let the hand-over continue.`,
        entityType: 'DMBHubTransfer', entityId: transfer._id, dedupeKey: `hublock:${transfer._id}:${which}`
    });
};

const emitHub = async (hubVendorId, event, payload) => {
    try {
        const { getIO } = await import('../../../config/socket.js');
        const io = getIO();
        io?.to(`vendor_${hubVendorId}`).emit(event, payload);
        io?.to(`restaurant:${String(hubVendorId)}`).emit(event, payload);
    } catch { /* live updates are optional */ }
};

export const dropAtHub = async ({ transferId, driverId, pin, now = new Date() }) => {
    const t = await DMBHubTransfer.findById(transferId);
    if (!t) throw new HubError('Transfer not found', 'NOT_FOUND', 404);
    if (!t.sourceDriverId || String(t.sourceDriverId) !== String(driverId)) throw new HubError('This hand-over is not yours', 'NOT_YOURS', 403);
    if (t.status !== 'pending_drop') throw new HubError(`This item is already ${t.status.replace('_', ' ')}`, 'WRONG_STATE', 409);
    const unit = await DMBDailyOrder.findById(t.unitId).select('status').lean();
    if (!unit || unit.status !== 'hub_transit') throw new HubError('Collect the item at the vendor first', 'NOT_COLLECTED', 409);
    if (t.dropAttempts >= MAX_PIN_ATTEMPTS) throw new HubError('Too many wrong PINs. Ask the hub to have a new PIN generated.', 'PIN_LOCKED', 423);
    if (t.dropPinExpiresAt && t.dropPinExpiresAt <= now) throw new HubError('This PIN has expired. Ask the hub to have a new PIN generated.', 'PIN_EXPIRED', 410);

    if (!sameHash(pinHash(t._id, pin), t.dropPinHash)) {
        const attempts = (await DMBHubTransfer.findOneAndUpdate({ _id: t._id }, { $inc: { dropAttempts: 1 } }, { new: true })).dropAttempts;
        if (attempts >= MAX_PIN_ATTEMPTS) { await lockAndAlert(t, 'drop'); throw new HubError('Too many wrong PINs. Ask the hub to have a new PIN generated.', 'PIN_LOCKED', 423); }
        throw new HubError(`Wrong PIN. ${MAX_PIN_ATTEMPTS - attempts} attempt(s) left.`, 'WRONG_PIN');
    }

    const ops = await hubSettings(t.destZoneId);
    const nextPin = newPin();
    const claimed = await DMBHubTransfer.findOneAndUpdate(
        { _id: t._id, status: 'pending_drop', dropConfirmed: false },
        {
            $set: {
                dropConfirmed: true, dropConfirmedAt: now, status: 'holding',
                pickupPinHash: pinHash(t._id, nextPin), pickupPinEnc: encryptField(nextPin), pickupPinExpiresAt: new Date(now.getTime() + Number(ops.pickupPinHours) * 3_600_000), pickupAttempts: 0,
                holdingDeadline: new Date(now.getTime() + Number(ops.maxHoldingMinutes) * 60_000)
            }
        },
        { new: true }
    );
    if (!claimed) throw new HubError('This item was handed over a moment ago', 'WRONG_STATE', 409);

    // Hub-stop pay: its own flat rate, credited at once; a hub bonus may follow. Never invented when no rate is set.
    const { resolveHubStopRate, awardBonuses } = await import('./driverEarnings.service.js');
    const rate = await resolveHubStopRate({ zoneId: t.sourceZoneId, slotKey: t.slotKey, date: t.date });
    let earning = 0;
    if (rate) {
        earning = r2(rate.rate);
    } else {
        await alertOnce({ type: 'hub_rate_missing', severity: 'critical', title: 'No hub stop rate is configured', message: 'A driver dropped an item at a hub but no hub stop rate applies, so nothing was credited. Set one under Driver Rates.', entityType: 'DMBHubTransfer', entityId: t._id, cityId: await cityIdForZone(t.sourceZoneId), link: '/admin/food/delivery-partners/rates', dedupeKey: 'hub-rate-missing' });
    }
    const awards = await awardBonuses({ driverId, zoneId: t.sourceZoneId, slotKey: t.slotKey, date: t.date, unitKind: 'hub', unitId: t._id, types: ['hub_bonus'] });
    const total = r2(earning + awards.reduce((s, a) => s + a.amount, 0));
    if (total > 0) {
        await DMBHubTransfer.updateOne({ _id: t._id }, { $set: { dropEarning: total } });
        await FoodDeliveryPartner.updateOne({ _id: driverId }, { $inc: { earningsToday: total } });
    }

    const hub = await FoodRestaurant.findById(t.hubVendorId).select('restaurantName').lean();
    await emitHub(t.hubVendorId, 'hub_item_received', { transferId: String(t._id) });
    try {
        const { notify } = await import('../notifications/notify.js');
        const { msg } = await import('../../i18n/i18n.service.js');
        if (t.zoneDriverId) {
            await notify({ to: 'driver', id: t.zoneDriverId, event: 'hub_item_ready', title: msg('Item waiting at the hub'), body: msg('An item for your route is now at {{hub}}. Ask the hub for the pickup PIN.', { hub: hub?.restaurantName || '' }), link: '/food/delivery', data: { transferId: String(t._id) } });
        }
        await notify({ to: 'vendor', id: t.hubVendorId, event: 'hub_item_received', title: msg('Item received at your hub'), body: msg('A driver handed over an item. Give the pickup PIN to the zone driver.'), link: '/vendor/hub', data: { transferId: String(t._id) } });
    } catch (err) {
        logger.warn(`[hub] notifications failed: ${err.message}`);
    }
    return { transferId: String(t._id), status: 'holding', earning: total, bonuses: awards };
};

// ─── PIN 2: the zone driver collects from the hub ───────────────────────────────────────────────────────────
export const pickupAtHub = async ({ transferId, driverId, pin, now = new Date() }) => {
    const t = await DMBHubTransfer.findById(transferId);
    if (!t) throw new HubError('Transfer not found', 'NOT_FOUND', 404);
    if (!t.zoneDriverId || String(t.zoneDriverId) !== String(driverId)) throw new HubError('This item is not on your route', 'NOT_YOURS', 403);
    if (t.status === 'picked_up') throw new HubError('You already collected this item', 'WRONG_STATE', 409);
    if (t.status !== 'holding') throw new HubError('The item has not arrived at the hub yet', 'NOT_AT_HUB', 409);
    if (t.pickupAttempts >= MAX_PIN_ATTEMPTS) throw new HubError('Too many wrong PINs. Ask the hub to have a new PIN generated.', 'PIN_LOCKED', 423);
    if (t.pickupPinExpiresAt && t.pickupPinExpiresAt <= now) throw new HubError('This PIN has expired. Ask the hub to have a new PIN generated.', 'PIN_EXPIRED', 410);

    if (!sameHash(pinHash(t._id, pin), t.pickupPinHash)) {
        const attempts = (await DMBHubTransfer.findOneAndUpdate({ _id: t._id }, { $inc: { pickupAttempts: 1 } }, { new: true })).pickupAttempts;
        if (attempts >= MAX_PIN_ATTEMPTS) { await lockAndAlert(t, 'pickup'); throw new HubError('Too many wrong PINs. Ask the hub to have a new PIN generated.', 'PIN_LOCKED', 423); }
        throw new HubError(`Wrong PIN. ${MAX_PIN_ATTEMPTS - attempts} attempt(s) left.`, 'WRONG_PIN');
    }
    const claimed = await DMBHubTransfer.findOneAndUpdate({ _id: t._id, status: 'holding', pickupConfirmed: false }, { $set: { pickupConfirmed: true, pickupConfirmedAt: now, status: 'picked_up' } }, { new: true });
    if (!claimed) throw new HubError('You already collected this item', 'WRONG_STATE', 409);

    // The item is now carried by the zone driver: a collected batch makes it part of their normal route and delivery.
    const unit = await DMBDailyOrder.findById(t.unitId).select('deliverySlot deliveryDate').lean();
    await DMBDailyOrder.updateOne({ _id: t.unitId }, { $set: { status: 'out_for_delivery', 'dispatch.deliveryPartnerId': oid(driverId), pickedUpAt: now } });
    const day = new Date(storageDateStr(t.date) + 'T00:00:00.000Z');
    const slot = unit?.deliverySlot || t.slotKey;
    let batch = await CollectionBatch.findOne({ vendorId: t.hubVendorId, driverId: oid(driverId), deliveryDate: day, deliverySlot: slot, status: 'collected' });
    if (batch) {
        batch.orderIds = [...new Set([...batch.orderIds.map(String), String(t.unitId)])];
        batch.boxCount = batch.orderIds.length;
        await batch.save();
    } else {
        await CollectionBatch.create({ vendorId: t.hubVendorId, driverId: oid(driverId), deliveryDate: day, deliverySlot: slot, boxCount: 1, orderIds: [t.unitId], status: 'collected', collectedAt: now, pinVerified: true, assignedAt: now });
    }
    await emitHub(t.hubVendorId, 'hub_item_collected', { transferId: String(t._id) });
    try { (await import('../subscription/dmb.dailyOrder.service.js')).notifyDriverOfRouteUpdate(driverId); } catch { /* route refresh is best effort */ }
    return { transferId: String(t._id), status: 'picked_up' };
};

// ─── Boards and lists ───────────────────────────────────────────────────────────────────────────────────────
const driverCard = (d) => (d ? { name: d.name || '', phone: d.phone || '' } : null);

/** The hub operator's screen: only this hub's own transfers. PINs are shown to the one person who has to say them. */
export const hubBoard = async ({ hubVendorId, now = new Date() }) => {
    const today = localToday(now);
    const [active, doneToday] = await Promise.all([
        DMBHubTransfer.find({ hubVendorId: oid(hubVendorId), status: { $in: ['pending_drop', 'holding'] }, date: { $gte: today, $lt: addDays(today, 2) } }).sort({ date: 1, createdAt: 1 }).lean(),
        DMBHubTransfer.countDocuments({ hubVendorId: oid(hubVendorId), status: 'picked_up', pickupConfirmedAt: { $gte: new Date(now.getTime() - 24 * 3_600_000) } })
    ]);
    const drivers = new Map((await FoodDeliveryPartner.find({ _id: { $in: active.flatMap((t) => [t.sourceDriverId, t.zoneDriverId]).filter(Boolean) } }).select('name phone').lean()).map((d) => [String(d._id), d]));
    const units = new Map((await DMBDailyOrder.find({ _id: { $in: active.map((t) => t.unitId) } }).select('status orderId').lean()).map((o) => [String(o._id), o]));
    const sources = new Map((await FoodRestaurant.find({ _id: { $in: active.map((t) => t.sourceVendorId) } }).select('restaurantName').lean()).map((v) => [String(v._id), v.restaurantName]));
    const card = (t) => ({
        transferId: t._id, orderId: units.get(String(t.unitId))?.orderId || '', items: t.items, from: sources.get(String(t.sourceVendorId)) || '', date: t.date, slotKey: t.slotKey,
        sourceDriver: driverCard(drivers.get(String(t.sourceDriverId))), zoneDriver: driverCard(drivers.get(String(t.zoneDriverId))), holdingDeadline: t.holdingDeadline
    });
    const incoming = active.filter((t) => t.status === 'pending_drop' && units.get(String(t.unitId))?.status === 'hub_transit')
        .map((t) => ({ ...card(t), dropPin: readPin(t.dropPinEnc), pinExpiresAt: t.dropPinExpiresAt, locked: t.dropAttempts >= MAX_PIN_ATTEMPTS }));
    const expected = active.filter((t) => t.status === 'pending_drop' && units.get(String(t.unitId))?.status !== 'hub_transit').map(card);
    const holding = active.filter((t) => t.status === 'holding').map((t) => ({ ...card(t), pickupPin: readPin(t.pickupPinEnc), pinExpiresAt: t.pickupPinExpiresAt, locked: t.pickupAttempts >= MAX_PIN_ATTEMPTS }));
    return { incoming, holding, expected, completedToday: doneToday };
};

/** A driver's hub tasks: items to drop at a hub, items to collect from one. */
export const driverHubTasks = async ({ driverId, now = new Date() }) => {
    const today = localToday(now);
    const rows = await DMBHubTransfer.find({
        date: { $gte: today, $lt: addDays(today, 2) },
        $or: [{ sourceDriverId: oid(driverId), status: 'pending_drop' }, { zoneDriverId: oid(driverId), status: { $in: ['pending_drop', 'holding'] } }]
    }).sort({ date: 1 }).lean();
    if (!rows.length) return [];
    const hubs = new Map((await FoodRestaurant.find({ _id: { $in: rows.map((t) => t.hubVendorId) } }).select('restaurantName addressLine1 location phone hubOperatorName hubActiveHours').lean()).map((h) => [String(h._id), h]));
    const units = new Map((await DMBDailyOrder.find({ _id: { $in: rows.map((t) => t.unitId) } }).select('status orderId').lean()).map((o) => [String(o._id), o]));
    const tasks = [];
    for (const t of rows) {
        const hub = hubs.get(String(t.hubVendorId));
        const base = { transferId: String(t._id), orderId: units.get(String(t.unitId))?.orderId || '', items: t.items, date: t.date, slotKey: t.slotKey, hub: { name: hub?.restaurantName || '', address: hub?.addressLine1 || '', phone: hub?.phone || '', location: hub?.location || null, operator: hub?.hubOperatorName || '', hours: hub?.hubActiveHours || null } };
        if (String(t.sourceDriverId) === String(driverId) && t.status === 'pending_drop') {
            tasks.push({ ...base, type: 'hub_dropoff', status: t.status, collected: units.get(String(t.unitId))?.status === 'hub_transit', locked: t.dropAttempts >= MAX_PIN_ATTEMPTS, expiresAt: t.dropPinExpiresAt });
        }
        if (String(t.zoneDriverId) === String(driverId)) {
            tasks.push({ ...base, type: 'hub_pickup', status: t.status, atHub: t.status === 'holding', locked: t.pickupAttempts >= MAX_PIN_ATTEMPTS, expiresAt: t.pickupPinExpiresAt });
        }
    }
    return tasks;
};

/** Admin monitor: every transfer of a day. */
export const adminTransfers = async ({ date, zoneIds = null } = {}) => {
    const day = new Date(storageDateStr(date || localToday()) + 'T00:00:00.000Z');
    const filter = { date: day, ...(zoneIds ? { $or: [{ sourceZoneId: { $in: zoneIds.map(oid) } }, { destZoneId: { $in: zoneIds.map(oid) } }] } : {}) };
    const rows = await DMBHubTransfer.find(filter).sort({ createdAt: 1 }).lean();
    const drivers = new Map((await FoodDeliveryPartner.find({ _id: { $in: rows.flatMap((t) => [t.sourceDriverId, t.zoneDriverId]).filter(Boolean) } }).select('name').lean()).map((d) => [String(d._id), d.name]));
    const vendors = new Map((await FoodRestaurant.find({ _id: { $in: rows.flatMap((t) => [t.hubVendorId, t.sourceVendorId]) } }).select('restaurantName').lean()).map((v) => [String(v._id), v.restaurantName]));
    return rows.map((t) => ({
        _id: t._id, status: t.status, slotKey: t.slotKey, items: t.items, hub: vendors.get(String(t.hubVendorId)) || '', from: vendors.get(String(t.sourceVendorId)) || '',
        sourceDriver: drivers.get(String(t.sourceDriverId)) || '', zoneDriver: drivers.get(String(t.zoneDriverId)) || '',
        dropAttempts: t.dropAttempts, pickupAttempts: t.pickupAttempts, holdingDeadline: t.holdingDeadline, dropEarning: t.dropEarning, droppedAt: t.dropConfirmedAt, pickedUpAt: t.pickupConfirmedAt
    }));
};

/** Admin: a PIN expired or locked — issue a fresh one and unlock the hand-over. */
export const regeneratePin = async ({ transferId, which, now = new Date() }) => {
    const t = await DMBHubTransfer.findById(transferId);
    if (!t) throw new HubError('Transfer not found', 'NOT_FOUND', 404);
    const ops = await hubSettings(t.destZoneId);
    const pin = newPin();
    if (which === 'drop') {
        if (t.status !== 'pending_drop') throw new HubError('The item is no longer waiting for a drop-off', 'WRONG_STATE', 409);
        await DMBHubTransfer.updateOne({ _id: t._id }, { $set: { dropPinHash: pinHash(t._id, pin), dropPinEnc: encryptField(pin), dropAttempts: 0, dropPinExpiresAt: new Date(now.getTime() + Number(ops.dropPinHours) * 3_600_000) } });
    } else if (which === 'pickup') {
        if (t.status !== 'holding') throw new HubError('The item is not waiting at the hub', 'WRONG_STATE', 409);
        await DMBHubTransfer.updateOne({ _id: t._id }, { $set: { pickupPinHash: pinHash(t._id, pin), pickupPinEnc: encryptField(pin), pickupAttempts: 0, pickupPinExpiresAt: new Date(now.getTime() + Number(ops.pickupPinHours) * 3_600_000) } });
    } else throw new HubError('Choose drop or pickup', 'INVALID_INPUT');
    await emitHub(t.hubVendorId, 'hub_pin_changed', { transferId: String(t._id) });
    return { regenerated: which };
};

/** Periodic: an item held too long, or a drop-off PIN that ran out before the driver arrived, alerts admin once. */
export const sweepHubs = async (now = new Date()) => {
    const out = { overdue: 0, expired: 0 };
    for (const t of await DMBHubTransfer.find({ status: 'holding', holdingDeadline: { $lte: now } }).lean()) {
        const res = await raiseAdminAlert({
            type: 'hub_holding_overdue', severity: 'critical', cityId: await cityIdForZone(t.destZoneId), link: '/admin/food/delivery-partners/hubs',
            title: 'An item is still waiting at a hub', message: `An item has been at the hub since ${t.dropConfirmedAt?.toISOString?.() || 'earlier'} and was not collected by the zone driver.`,
            entityType: 'DMBHubTransfer', entityId: t._id, dedupeKey: `hubhold:${t._id}`
        });
        if (res.created) out.overdue += 1;
    }
    for (const t of await DMBHubTransfer.find({ status: 'pending_drop', dropPinExpiresAt: { $lte: now } }).lean()) {
        const res = await raiseAdminAlert({
            type: 'hub_drop_pin_expired', severity: 'warning', cityId: await cityIdForZone(t.destZoneId), link: '/admin/food/delivery-partners/hubs',
            title: 'A hub drop-off PIN expired', message: 'The source driver has not reached the hub before the PIN expired. Generate a new PIN if they are on the way.',
            entityType: 'DMBHubTransfer', entityId: t._id, dedupeKey: `hubexp:${t._id}:${t.dropPinExpiresAt.getTime()}`
        });
        if (res.created) out.expired += 1;
    }
    return out;
};

