import mongoose from 'mongoose';
import { DMBDeliveryRate, DMBDriverPromotion, DMBPromotionAward, DMBBundlePay, PROMOTION_TYPES } from './driverEarnings.models.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { FoodZone } from '../../food/admin/models/zone.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { DMBHubTransfer } from './hub.models.js';
import { cityIdForZone, getControl, zoneIdsForCity } from '../platform/platformConfig.service.js';
import { DeliveryOrderFeeSettings } from '../../food/admin/models/deliveryOrderFeeSettings.model.js';
import { addDays, dateOnlyFromStr, storageDateStr, localToday } from '../../../utils/platformTime.js';

/**
 * Driver earnings. A delivery pays the most specific active rate (zone x slot, zone, slot, base) in force on its day, plus
 * the boosts of any running rate_boost promotion. Count-based promotions pay a bonus once per driver and period when the
 * target is reached; the bonus is added to the delivery that reached it, so every report that sums deliveries includes it.
 * Hub drop-off stops pay their own flat rate and never count as deliveries.
 */

export class EarningsError extends Error {
    constructor(message, code = 'EARNINGS_ERROR', statusCode = 400) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
    }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/**
 * Every "exactly once" rule here (a bonus per period, one payment per bundle) is enforced by a unique index. A collection that
 * was just created builds its index in the background, so wait for it before the first claim instead of trusting timing.
 */
let indexesReady = null;
const claimsReady = () => (indexesReady ||= Promise.all([DMBPromotionAward.init(), DMBBundlePay.init()]).catch((err) => { indexesReady = null; throw err; }));
const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? new mongoose.Types.ObjectId(String(v)) : null);
const dayOf = (v) => (typeof v === 'string' ? dateOnlyFromStr(v) : new Date(storageDateStr(v) + 'T00:00:00.000Z'));
/** Monday (UTC midnight of the stored local date) of the week containing `date`. */
export const weekStartOf = (date) => {
    const d = dayOf(date);
    return addDays(d, -((d.getUTCDay() + 6) % 7));
};

// ─── Rates ──────────────────────────────────────────────────────────────────────────────────────────────────

const specificity = (row) => (row.zoneId && row.slotKey ? 4 : row.zoneId ? 3 : row.slotKey ? 2 : 1);

/** The Fee Settings value admin already configures, used only when no row of the rate table applies. Null when unset. */
export const feeSettingsRate = async () => {
    const cfg = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
    const fee = Number(cfg?.feePerOrder);
    return Number.isFinite(fee) && fee > 0 ? fee : null;
};

const candidateRows = async ({ zoneId, slotKey, date }) => {
    const cityId = zoneId ? await cityIdForZone(zoneId) : null;
    const rows = await DMBDeliveryRate.find({
        isActive: true,
        effectiveFrom: { $lte: dayOf(date) },
        cityId: { $in: [null, ...(cityId ? [cityId] : [])] },
        zoneId: { $in: [null, ...(oid(zoneId) ? [oid(zoneId)] : [])] },
        slotKey: { $in: ['', String(slotKey || '').toLowerCase()] }
    }).lean();
    return rows.sort((a, b) => specificity(b) - specificity(a)
        || Number(Boolean(b.cityId)) - Number(Boolean(a.cityId))
        || new Date(b.effectiveFrom) - new Date(a.effectiveFrom));
};

/** { rate, source, rateId } for a delivery in a zone and slot on a day; null when nothing is configured at all. */
export const resolveRate = async ({ zoneId, slotKey, date }) => {
    const [row] = await candidateRows({ zoneId, slotKey, date });
    if (row) {
        return { rate: row.ratePln, rateId: String(row._id), source: { 4: 'zone_slot', 3: 'zone', 2: 'slot', 1: 'base' }[specificity(row)] };
    }
    const fee = await feeSettingsRate();
    return fee === null ? null : { rate: fee, rateId: null, source: 'fee_settings' };
};

/** What a hub drop-off stop pays: the most specific row that has a hub stop rate. Null when none sets one. */
export const resolveHubStopRate = async ({ zoneId, slotKey, date }) => {
    const row = (await candidateRows({ zoneId, slotKey, date })).find((r) => r.hubStopRate !== null && r.hubStopRate !== undefined);
    return row ? { rate: row.hubStopRate, rateId: String(row._id) } : null;
};

// ─── Promotions ─────────────────────────────────────────────────────────────────────────────────────────────

const promotionsEnabled = async (zoneId) => Boolean((await getControl('driverPromotions', { zoneId })).enabled);

/** Running promotions that apply to a delivery (city, zone and slot scope, inside their window). */
const runningPromotions = async ({ zoneId, slotKey, date, types }) => {
    if (!(await promotionsEnabled(zoneId))) return [];
    const cityId = zoneId ? await cityIdForZone(zoneId) : null;
    const d = dayOf(date);
    return DMBDriverPromotion.find({
        status: 'active', validFrom: { $lte: d }, validUntil: { $gte: d },
        ...(types ? { type: { $in: types } } : {}),
        cityId: { $in: [null, ...(cityId ? [cityId] : [])] },
        zoneId: { $in: [null, ...(oid(zoneId) ? [oid(zoneId)] : [])] },
        slotKey: { $in: ['', String(slotKey || '').toLowerCase()] }
    }).lean();
};

/** The pay for one delivery before any count bonus: rate + rate-boost promotions. Null when no rate is configured. */
export const previewDeliveryEarning = async ({ zoneId, slotKey, date }) => {
    const base = await resolveRate({ zoneId, slotKey, date });
    if (!base) return null;
    const boosts = (await runningPromotions({ zoneId, slotKey, date, types: ['rate_boost'] }))
        .filter((p) => p.rateBoostPln > 0)
        .map((p) => ({ promotionId: String(p._id), name: p.name, amount: p.rateBoostPln }));
    const amount = r2(base.rate + boosts.reduce((s, b) => s + b.amount, 0));
    return { amount, base: base.rate, source: base.source, rateId: base.rateId, boosts };
};

/**
 * Confirmed deliveries of a driver in [from, to] (inclusive days), optionally limited to a zone and slot:
 * { deliveries, days } where `days` are the distinct delivery dates.
 */
export const confirmedDeliveries = async ({ driverId, from, to, zoneId = null, slotKey = '' }) => {
    const driver = oid(driverId);
    const end = addDays(dayOf(to), 1);
    const mealFilter = { 'dispatch.deliveryPartnerId': driver, paymentConfirmed: true, deliveryDate: { $gte: dayOf(from), $lt: end } };
    if (zoneId) mealFilter.zoneId = oid(zoneId);
    if (slotKey) mealFilter.deliverySlot = slotKey;
    const meals = await DMBDailyOrder.find(mealFilter).select('deliveryDate bundleId').lean();
    const days = new Set(meals.map((m) => storageDateStr(m.deliveryDate)));
    // A bundle (one doorbell) is one drop however many items it holds.
    const drops = new Set(meals.map((m) => m.bundleId || String(m._id)));

    const bagOrders = await PantryOrder.find({
        status: 'paid', dailyDeliveries: { $elemMatch: { driverId: driver, paymentConfirmed: true, date: { $gte: dayOf(from), $lt: end } } }
    }).select('vendorId dailyDeliveries').lean();
    let shopZone = null;
    if (zoneId && bagOrders.length) {
        shopZone = new Map((await FoodRestaurant.find({ _id: { $in: bagOrders.map((b) => b.vendorId) } }).select('zoneId').lean()).map((v) => [String(v._id), String(v.zoneId || '')]));
    }
    for (const po of bagOrders) {
        if (zoneId && shopZone.get(String(po.vendorId)) !== String(zoneId)) continue;
        for (const dd of po.dailyDeliveries) {
            if (String(dd.driverId) !== String(driver) || !dd.paymentConfirmed || dd.date < dayOf(from) || dd.date >= end) continue;
            if (slotKey && dd.slot !== slotKey) continue;
            drops.add(dd.bundleId || String(dd._id));
            days.add(storageDateStr(dd.date));
        }
    }
    return { deliveries: drops.size, days };
};

const hubStopsInWeek = async ({ driverId, weekStart }) => DMBHubTransfer.countDocuments({
    sourceDriverId: oid(driverId), dropConfirmed: true, dropConfirmedAt: { $gte: weekStart, $lt: addDays(weekStart, 7) }
});

/** True when every delivery of a zone (and slot) on a day is delivered, none failed or still open, and the driver delivered some. */
const zoneDayComplete = async ({ driverId, date, zoneId, slotKey }) => {
    const d = dayOf(date);
    const filter = { deliveryDate: { $gte: d, $lt: addDays(d, 1) }, status: { $nin: ['skipped'] }, zoneId: oid(zoneId) };
    if (slotKey) filter.deliverySlot = slotKey;
    const orders = await DMBDailyOrder.find(filter).select('status dispatch').lean();
    if (!orders.length || orders.some((o) => o.status !== 'delivered')) return false;
    return orders.some((o) => String(o.dispatch?.deliveryPartnerId) === String(driverId));
};

/** Progress of one promotion for one driver. */
const progressOf = async (promo, { driverId, date }) => {
    const week = weekStartOf(date);
    const weekEnd = addDays(week, 6);
    const zoneId = promo.zoneId ? String(promo.zoneId) : null;
    if (promo.type === 'delivery_count') {
        return { current: (await confirmedDeliveries({ driverId, from: week, to: weekEnd, zoneId, slotKey: promo.slotKey })).deliveries, target: promo.targetCount, periodKey: `week:${storageDateStr(week)}` };
    }
    if (promo.type === 'slot_coverage') {
        return { current: (await confirmedDeliveries({ driverId, from: week, to: weekEnd, zoneId, slotKey: promo.slotKey })).days.size, target: promo.targetCount, periodKey: `week:${storageDateStr(week)}` };
    }
    if (promo.type === 'hub_bonus') {
        return { current: await hubStopsInWeek({ driverId, weekStart: week }), target: promo.targetCount, periodKey: `week:${storageDateStr(week)}` };
    }
    if (promo.type === 'zone_coverage') {
        const done = zoneId ? await zoneDayComplete({ driverId, date, zoneId, slotKey: promo.slotKey }) : false;
        return { current: done ? 1 : 0, target: 1, periodKey: `day:${storageDateStr(date)}` };
    }
    return { current: 0, target: 0, periodKey: '' };
};

/**
 * Pays every count-based promotion the driver has just reached. Each driver gets each (promotion, period) bonus once.
 * Returns the awards created now: [{ promotionId, name, amount }].
 */
export const awardBonuses = async ({ driverId, zoneId, slotKey, date, unitKind, unitId, types = ['delivery_count', 'slot_coverage', 'zone_coverage', 'hub_bonus'] }) => {
    await claimsReady();
    const awarded = [];
    for (const promo of await runningPromotions({ zoneId, slotKey, date, types })) {
        if (!(promo.bonusPln > 0)) continue;
        const p = await progressOf(promo, { driverId, date });
        if (!p.periodKey || !(p.target > 0) || p.current < p.target) continue;
        try {
            await DMBPromotionAward.create({ promotionId: promo._id, driverId: oid(driverId), periodKey: p.periodKey, amount: promo.bonusPln, unitKind, unitId: oid(unitId) });
            awarded.push({ promotionId: String(promo._id), name: promo.name, amount: promo.bonusPln });
        } catch (err) {
            if (err?.code !== 11000) throw err; // already paid for this period
        }
    }
    return awarded;
};

/** Active promotions a driver can see (their zones), with progress this week. Drives the home-screen bars. */
export const promotionsForDriver = async ({ driverId, zoneIds = [], date = localToday() }) => {
    const d = dayOf(date);
    const promos = await DMBDriverPromotion.find({
        status: 'active', validFrom: { $lte: d }, validUntil: { $gte: d },
        zoneId: { $in: [null, ...zoneIds.map(oid).filter(Boolean)] }
    }).sort({ validUntil: 1 }).lean();
    const out = [];
    for (const promo of promos) {
        if (promo.cityId) {
            const cities = await Promise.all(zoneIds.map((z) => cityIdForZone(z)));
            if (!cities.some((c) => String(c) === String(promo.cityId))) continue;
        }
        if (promo.type === 'rate_boost') {
            out.push({ _id: promo._id, name: promo.name, type: promo.type, rateBoostPln: promo.rateBoostPln, validUntil: promo.validUntil, slotKey: promo.slotKey, zoneId: promo.zoneId, current: 0, target: 0, bonusPln: 0, achieved: false });
            continue;
        }
        const p = await progressOf(promo, { driverId, date: d });
        const achieved = Boolean(p.periodKey) && Boolean(await DMBPromotionAward.exists({ promotionId: promo._id, driverId: oid(driverId), periodKey: p.periodKey }));
        out.push({ _id: promo._id, name: promo.name, type: promo.type, bonusPln: promo.bonusPln, validUntil: promo.validUntil, slotKey: promo.slotKey, zoneId: promo.zoneId, current: Math.min(p.current, p.target), target: p.target, achieved });
    }
    return out;
};

const alertRateMissing = async (entityType, entityId, zoneId) => {
    try {
        const { raiseAdminAlert } = await import('../platform/platformConfig.service.js');
        await raiseAdminAlert({
            type: 'driver_fee_missing', severity: 'critical', cityId: zoneId ? await cityIdForZone(zoneId) : null,
            title: 'No driver delivery rate is configured',
            message: 'A driver could not be credited for a delivery because no delivery rate applies to it. Add a base rate under Driver Rates (or set the delivery fee in Fee Settings).',
            entityType, entityId, link: '/admin/food/delivery-partners/rates', dedupeKey: 'driver-rate-missing'
        });
    } catch { /* an alert never blocks the answer */ }
};

/** Adds count bonuses just reached to the delivery that reached them and to the driver's day. Returns the bonus total. */
const payBonuses = async ({ driverId, zoneId, slotKey, date, unitKind, unitId, add }) => {
    const awards = await awardBonuses({ driverId, zoneId, slotKey, date, unitKind, unitId });
    const bonus = r2(awards.reduce((s, a) => s + a.amount, 0));
    if (bonus > 0) {
        await add(bonus, awards);
        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        await FoodDeliveryPartner.updateOne({ _id: driverId }, { $inc: { earningsToday: bonus } });
    }
    return { bonus, awards };
};

/**
 * A bundle is one drop: the first confirmed item pays the full rate (+ boosts) and counts as the delivery, the others of the
 * same bundle pay nothing. `release()` undoes the claim when the item itself turns out to be confirmed already.
 */
const claimDrop = async (bundleId, driverId, pay) => {
    await claimsReady();
    const full = { amount: pay.amount, base: pay.base, source: pay.source, boosts: pay.boosts, paysDrop: true, release: async () => {} };
    if (!bundleId) return full;
    try {
        const row = await DMBBundlePay.create({ bundleId, driverId: oid(driverId) });
        return { ...full, release: async () => { await DMBBundlePay.deleteOne({ _id: row._id }); } };
    } catch (err) {
        if (err?.code !== 11000) throw err;
        return { amount: 0, base: 0, source: 'bundle', boosts: [], paysDrop: false, release: async () => {} };
    }
};

/**
 * The driver confirms the drop of a meal order: pays rate + boosts once (atomic claim), then any bonus the delivery reached.
 * Throws EarningsError RATE_NOT_SET (and alerts admin) when no rate applies; ALREADY_CONFIRMED on a second tap.
 */
export const settleMealDelivery = async ({ orderId, driverId, method = '' }) => {
    const order = await DMBDailyOrder.findById(orderId).select('zoneId deliverySlot deliveryDate paymentConfirmed bundleId').lean();
    if (!order) throw new EarningsError('Order not found', 'NOT_FOUND', 404);
    if (order.paymentConfirmed) throw new EarningsError('Payment already confirmed for this order', 'ALREADY_CONFIRMED');
    const pay = await previewDeliveryEarning({ zoneId: order.zoneId, slotKey: order.deliverySlot, date: order.deliveryDate });
    if (!pay) {
        await alertRateMissing('DMBDailyOrder', orderId, order.zoneId);
        throw new EarningsError('The delivery rate for drivers is not configured yet. Admin has been told; please try again later.', 'RATE_NOT_SET', 409);
    }
    const drop = await claimDrop(order.bundleId, driverId, pay);
    const claimed = await DMBDailyOrder.findOneAndUpdate(
        { _id: orderId, paymentConfirmed: { $ne: true } },
        { $set: { paymentConfirmed: true, riderEarning: drop.amount, paymentMethod: method, earningBreakdown: { rate: drop.base, source: drop.source, boosts: drop.boosts, bonuses: [] } } },
        { new: true }
    );
    if (!claimed) {
        await drop.release();
        throw new EarningsError('Payment already confirmed for this order', 'ALREADY_CONFIRMED');
    }
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    await FoodDeliveryPartner.updateOne({ _id: driverId }, { $inc: { earningsToday: drop.amount, ...(drop.paysDrop ? { deliveriesToday: 1 } : {}) } });
    const { bonus, awards } = !drop.paysDrop ? { bonus: 0, awards: [] } : await payBonuses({
        driverId, zoneId: order.zoneId, slotKey: order.deliverySlot, date: order.deliveryDate, unitKind: 'meal', unitId: orderId,
        add: (amount, list) => DMBDailyOrder.updateOne({ _id: orderId }, { $inc: { riderEarning: amount }, $push: { 'earningBreakdown.bonuses': { $each: list } } })
    });
    return { riderEarning: r2(drop.amount + bonus), base: drop.base, boosts: drop.boosts, bonuses: awards, bundled: !drop.paysDrop };
};

/** The same for a pantry bag (identified by its delivery id), paid by the zone of its shop. */
export const settlePantryDelivery = async ({ deliveryId, driverId }) => {
    const po = await PantryOrder.findOne({ 'dailyDeliveries._id': deliveryId }).select('vendorId dailyDeliveries').lean();
    const dd = po?.dailyDeliveries.find((x) => String(x._id) === String(deliveryId));
    if (!dd) throw new EarningsError('Delivery not found', 'NOT_FOUND', 404);
    if (dd.paymentConfirmed) throw new EarningsError('Payment already confirmed for this order', 'ALREADY_CONFIRMED');
    const zoneId = (await FoodRestaurant.findById(po.vendorId).select('zoneId').lean())?.zoneId || null;
    const pay = await previewDeliveryEarning({ zoneId, slotKey: dd.slot, date: dd.date });
    if (!pay) {
        await alertRateMissing('PantryOrder', deliveryId, zoneId);
        throw new EarningsError('The delivery rate for drivers is not configured yet. Admin has been told; please try again later.', 'RATE_NOT_SET', 409);
    }
    const drop = await claimDrop(dd.bundleId, driverId, pay);
    const claimed = await PantryOrder.updateOne(
        { dailyDeliveries: { $elemMatch: { _id: new mongoose.Types.ObjectId(String(deliveryId)), paymentConfirmed: { $ne: true } } } },
        { $set: { 'dailyDeliveries.$.paymentConfirmed': true, 'dailyDeliveries.$.riderEarning': drop.amount, 'dailyDeliveries.$.earningBreakdown': { rate: drop.base, source: drop.source, boosts: drop.boosts, bonuses: [] } } }
    );
    if (!claimed.modifiedCount) {
        await drop.release();
        throw new EarningsError('Payment already confirmed for this order', 'ALREADY_CONFIRMED');
    }
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    await FoodDeliveryPartner.updateOne({ _id: driverId }, { $inc: { earningsToday: drop.amount, ...(drop.paysDrop ? { deliveriesToday: 1 } : {}) } });
    const { bonus, awards } = !drop.paysDrop ? { bonus: 0, awards: [] } : await payBonuses({
        driverId, zoneId, slotKey: dd.slot, date: dd.date, unitKind: 'pantry', unitId: deliveryId,
        add: (amount, list) => PantryOrder.updateOne({ 'dailyDeliveries._id': deliveryId }, { $inc: { 'dailyDeliveries.$.riderEarning': amount }, $push: { 'dailyDeliveries.$.earningBreakdown.bonuses': { $each: list } } })
    });
    return { riderEarning: r2(drop.amount + bonus), base: drop.base, boosts: drop.boosts, bonuses: awards, bundled: !drop.paysDrop };
};

// ─── Admin: rates ───────────────────────────────────────────────────────────────────────────────────────────

const money = (v, label, { nullable = false } = {}) => {
    if (nullable && (v === null || v === undefined || v === '')) return null;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > 1000) throw new EarningsError(`${label} must be between 0 and 1000`, 'INVALID_AMOUNT');
    return r2(n);
};

const cleanScope = async ({ cityId, zoneId, slotKey }) => {
    const out = { cityId: oid(cityId), zoneId: oid(zoneId), slotKey: String(slotKey || '').trim().toLowerCase() };
    if (out.zoneId) {
        const zone = await FoodZone.findById(out.zoneId).select('_id').lean();
        if (!zone) throw new EarningsError('Zone not found', 'INVALID_ZONE');
        const zoneCity = await cityIdForZone(out.zoneId);
        if (out.cityId && zoneCity && String(zoneCity) !== String(out.cityId)) throw new EarningsError('That zone is not in the chosen city', 'ZONE_CITY_MISMATCH');
        if (!out.cityId && zoneCity) out.cityId = oid(zoneCity);
    }
    if (out.slotKey) {
        const { DeliverySlot } = await import('../deliverySlot/deliverySlot.model.js');
        if (!(await DeliverySlot.exists({ key: out.slotKey }))) throw new EarningsError('Slot not found', 'INVALID_SLOT');
    }
    return out;
};

export const listRates = async ({ cityIds = null } = {}) => {
    const filter = cityIds ? { cityId: { $in: cityIds.map(oid).filter(Boolean) } } : {};
    return DMBDeliveryRate.find(filter).sort({ cityId: 1, zoneId: 1, slotKey: 1, effectiveFrom: -1 }).lean();
};

export const saveRate = async (body, adminId = null, id = null) => {
    const scope = await cleanScope(body);
    const doc = {
        ...scope,
        ratePln: money(body.ratePln, 'The delivery rate'),
        hubStopRate: money(body.hubStopRate, 'The hub stop rate', { nullable: true }),
        effectiveFrom: body.effectiveFrom ? dayOf(String(body.effectiveFrom).slice(0, 10)) : localToday(),
        isActive: body.isActive !== false,
        note: String(body.note || '').slice(0, 200),
        updatedBy: adminId
    };
    if (Number.isNaN(doc.effectiveFrom.getTime())) throw new EarningsError('Invalid start date', 'INVALID_DATE');
    if (id) {
        const updated = await DMBDeliveryRate.findByIdAndUpdate(id, { $set: doc }, { new: true }).lean();
        if (!updated) throw new EarningsError('Rate not found', 'NOT_FOUND', 404);
        return updated;
    }
    return (await DMBDeliveryRate.create(doc)).toObject();
};

export const removeRate = async (id) => {
    const res = await DMBDeliveryRate.deleteOne({ _id: id });
    if (!res.deletedCount) throw new EarningsError('Rate not found', 'NOT_FOUND', 404);
    return { removed: true };
};

// ─── Admin: promotions ──────────────────────────────────────────────────────────────────────────────────────

const assertCanActivate = async (promo, excludeId = null) => {
    const ctxZone = promo.zoneId || (promo.cityId ? (await zoneIdsForCity(promo.cityId))[0] : null);
    const cfg = await getControl('driverPromotions', ctxZone ? { zoneId: ctxZone } : promo.cityId ? { cityId: promo.cityId } : {});
    if (!cfg.enabled) throw new EarningsError('Driver promotions are switched off here (ACM-186)', 'PROMOTIONS_DISABLED');
    const running = await DMBDriverPromotion.countDocuments({
        status: 'active', cityId: promo.cityId || null, validUntil: { $gte: localToday() }, ...(excludeId ? { _id: { $ne: excludeId } } : {})
    });
    if (running >= Number(cfg.maxActive)) throw new EarningsError(`This city already has ${running} active promotions (the limit is ${cfg.maxActive})`, 'TOO_MANY_PROMOTIONS');
};

const cleanPromotion = async (body) => {
    if (!PROMOTION_TYPES.includes(body.type)) throw new EarningsError('Unknown promotion type', 'INVALID_TYPE');
    const scope = await cleanScope(body);
    const validFrom = dayOf(String(body.validFrom || '').slice(0, 10));
    const validUntil = dayOf(String(body.validUntil || '').slice(0, 10));
    if (Number.isNaN(validFrom.getTime()) || Number.isNaN(validUntil.getTime())) throw new EarningsError('Choose the first and last day', 'INVALID_DATE');
    if (validUntil < validFrom) throw new EarningsError('The last day cannot be before the first day', 'INVALID_DATE');
    const name = String(body.name || '').trim();
    if (!name) throw new EarningsError('Give the promotion a name', 'INVALID_NAME');
    const countType = ['delivery_count', 'slot_coverage', 'hub_bonus'].includes(body.type);
    const doc = { ...scope, name: name.slice(0, 80), type: body.type, validFrom, validUntil, targetCount: 0, bonusPln: 0, rateBoostPln: 0 };
    if (body.type === 'rate_boost') {
        doc.rateBoostPln = money(body.rateBoostPln, 'The boost');
        if (!(doc.rateBoostPln > 0)) throw new EarningsError('The boost must be more than 0', 'INVALID_AMOUNT');
    } else {
        doc.bonusPln = money(body.bonusPln, 'The bonus');
        if (!(doc.bonusPln > 0)) throw new EarningsError('The bonus must be more than 0', 'INVALID_AMOUNT');
        if (countType) {
            doc.targetCount = Math.floor(Number(body.targetCount));
            if (!(doc.targetCount >= 1)) throw new EarningsError('The target must be at least 1', 'INVALID_TARGET');
        }
        if (body.type === 'zone_coverage' && !doc.zoneId) throw new EarningsError('A zone coverage promotion needs a zone', 'ZONE_REQUIRED');
        if (body.type === 'slot_coverage' && !doc.slotKey) throw new EarningsError('A slot coverage promotion needs a slot', 'SLOT_REQUIRED');
    }
    return doc;
};

const withComputedStatus = (p) => (p.status === 'active' && new Date(p.validUntil) < localToday() ? { ...p, status: 'expired' } : p);

export const listPromotions = async ({ cityIds = null } = {}) => {
    const filter = cityIds ? { cityId: { $in: cityIds.map(oid).filter(Boolean) } } : {};
    return (await DMBDriverPromotion.find(filter).sort({ validUntil: -1 }).lean()).map(withComputedStatus);
};

export const savePromotion = async (body, adminId = null, id = null) => {
    const doc = { ...(await cleanPromotion(body)), updatedBy: adminId };
    const wantsActive = body.status === 'active';
    if (wantsActive) await assertCanActivate(doc, id);
    doc.status = wantsActive ? 'active' : 'draft';
    if (id) {
        const updated = await DMBDriverPromotion.findByIdAndUpdate(id, { $set: doc }, { new: true }).lean();
        if (!updated) throw new EarningsError('Promotion not found', 'NOT_FOUND', 404);
        return updated;
    }
    return (await DMBDriverPromotion.create(doc)).toObject();
};

export const setPromotionStatus = async (id, status, adminId = null) => {
    if (!['draft', 'active'].includes(status)) throw new EarningsError('Status must be draft or active', 'INVALID_STATUS');
    const promo = await DMBDriverPromotion.findById(id).lean();
    if (!promo) throw new EarningsError('Promotion not found', 'NOT_FOUND', 404);
    if (status === 'active') await assertCanActivate(promo, id);
    return DMBDriverPromotion.findByIdAndUpdate(id, { $set: { status, updatedBy: adminId } }, { new: true }).lean();
};
