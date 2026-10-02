import mongoose from 'mongoose';
import { DMBPlatformHoliday } from './holiday.model.js';
import { cityIdForZone, zoneIdsForCity, getControl } from './platformConfig.service.js';
import { dateOnlyFromStr, storageDateStr, localToday, addDays } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Business holidays / platform closures (Gap G, ACM-153).
 * A confirmed holiday removes every delivery and driver shift on that date for its scope, extends the affected
 * subscriptions so customers do not lose a paid delivery, and is announced 7 and 3 days ahead.
 */

const pad = (n) => String(n).padStart(2, '0');
const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

/** Gregorian Easter Sunday (anonymous Gregorian algorithm). */
export const easterSunday = (year) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
};

/** Official Polish public holidays (Ustawa o dniach wolnych od pracy). 24 December is a holiday from 2025. */
export const polishPublicHolidays = (year) => {
    const easter = easterSunday(year);
    const rel = (days) => storageDateStr(addDays(easter, days));
    const list = [
        { date: ymd(year, 1, 1), name: 'Nowy Rok (New Year\'s Day)', icon: '🎆' },
        { date: ymd(year, 1, 6), name: 'Trzech Króli (Epiphany)', icon: '👑' },
        { date: rel(0), name: 'Wielkanoc (Easter Sunday)', icon: '🐣' },
        { date: rel(1), name: 'Poniedziałek Wielkanocny (Easter Monday)', icon: '🐣' },
        { date: ymd(year, 5, 1), name: 'Święto Pracy (Labour Day)', icon: '🛠️' },
        { date: ymd(year, 5, 3), name: 'Święto Konstytucji 3 Maja (Constitution Day)', icon: '🇵🇱' },
        { date: rel(49), name: 'Zielone Świątki (Pentecost)', icon: '🕊️' },
        { date: rel(60), name: 'Boże Ciało (Corpus Christi)', icon: '⛪' },
        { date: ymd(year, 8, 15), name: 'Wniebowzięcie NMP (Assumption Day)', icon: '⛪' },
        { date: ymd(year, 11, 1), name: 'Wszystkich Świętych (All Saints\' Day)', icon: '🕯️' },
        { date: ymd(year, 11, 11), name: 'Narodowe Święto Niepodległości (Independence Day)', icon: '🇵🇱' },
        { date: ymd(year, 12, 25), name: 'Boże Narodzenie (Christmas Day)', icon: '🎄' },
        { date: ymd(year, 12, 26), name: 'Drugi dzień Bożego Narodzenia (St Stephen\'s Day)', icon: '🎄' }
    ];
    if (year >= 2025) list.push({ date: ymd(year, 12, 24), name: 'Wigilia (Christmas Eve)', icon: '🎄' });
    return list.sort((x, y) => x.date.localeCompare(y.date));
};

// ─── Lookup (cached) ─────────────────────────────────────────────────────────────────────────────────────

let cache = { at: 0, rows: [] };
export const invalidateHolidayCache = () => { cache = { at: 0, rows: [] }; };

const confirmedRows = async () => {
    if (Date.now() - cache.at < 30_000) return cache.rows;
    const from = addDays(localToday(), -400);
    const rows = await DMBPlatformHoliday.find({ status: 'confirmed', date: { $gte: from } }).select('date scope cityId name icon').lean();
    cache = { at: Date.now(), rows };
    return rows;
};

/** Set of 'YYYY-MM-DD' confirmed holidays that apply to a city (null city = only platform-wide ones). */
export const holidaySetForCity = async (cityId) => {
    const rows = await confirmedRows();
    return new Set(rows.filter((r) => r.scope === 'all' || (cityId && String(r.cityId) === String(cityId))).map((r) => storageDateStr(r.date)));
};

export const holidaySetForZone = async (zoneId) => holidaySetForCity(await cityIdForZone(zoneId));

/** Holiday details for a date range (for the customer calendar / driver shifts). */
export const holidaysInRange = async ({ cityId, from, to }) => {
    const rows = await confirmedRows();
    const a = storageDateStr(from);
    const b = storageDateStr(to);
    return rows
        .filter((r) => (r.scope === 'all' || (cityId && String(r.cityId) === String(cityId))))
        .map((r) => ({ date: storageDateStr(r.date), name: r.name, icon: r.icon }))
        .filter((r) => r.date >= a && r.date <= b);
};

// ─── Admin operations ────────────────────────────────────────────────────────────────────────────────────

const toStorage = (d) => {
    const s = typeof d === 'string' ? d : storageDateStr(d);
    const out = dateOnlyFromStr(s);
    if (!out) throw new Error('Invalid date (expected YYYY-MM-DD)');
    return out;
};

export const listHolidays = async ({ year, status, cityId } = {}) => {
    const filter = {};
    if (year) filter.date = { $gte: new Date(Date.UTC(Number(year), 0, 1)), $lt: new Date(Date.UTC(Number(year) + 1, 0, 1)) };
    if (status) filter.status = status;
    if (cityId) filter.$or = [{ scope: 'all' }, { cityId }];
    return DMBPlatformHoliday.find(filter).sort({ date: 1 }).populate('cityId', 'name').lean();
};

export const createHoliday = async ({ date, name, scope = 'all', cityId = null, icon = '🎄', confirm = false }, admin) => {
    if (!String(name || '').trim()) throw new Error('Holiday name is required');
    if (scope === 'city' && !mongoose.Types.ObjectId.isValid(String(cityId))) throw new Error('Choose the city this closure applies to');
    const doc = await DMBPlatformHoliday.create({
        date: toStorage(date), name: String(name).trim().slice(0, 120), scope, cityId: scope === 'city' ? cityId : null,
        icon: String(icon || '🎄').slice(0, 8), status: 'pending'
    });
    if (confirm) return confirmHoliday(doc._id, admin);
    return doc.toObject();
};

/** Imports the year's Polish public holidays as *pending* — an admin must confirm each one (never auto-applied). */
export const importPolishHolidays = async (year) => {
    const y = Number(year);
    if (!Number.isInteger(y) || y < 2024 || y > 2100) throw new Error('Invalid year');
    const settings = await getControl('holidayAutoImport');
    if (!settings.enabled) throw new Error('Polish holiday import is switched off (ACM-153)');
    let created = 0;
    for (const h of polishPublicHolidays(y)) {
        const res = await DMBPlatformHoliday.updateOne(
            { date: toStorage(h.date), scope: 'all', cityId: null },
            { $setOnInsert: { date: toStorage(h.date), name: h.name, icon: h.icon, scope: 'all', cityId: null, autoImported: true, status: 'pending' } },
            { upsert: true }
        );
        if (res.upsertedCount) created++;
    }
    return { year: y, created, total: polishPublicHolidays(y).length };
};

export const rejectHoliday = async (id) => {
    const doc = await DMBPlatformHoliday.findById(id);
    if (!doc) throw new Error('Holiday not found');
    if (doc.status === 'confirmed' && doc.appliedAt) throw new Error('This holiday is already applied; delete it instead');
    doc.status = 'rejected';
    await doc.save();
    invalidateHolidayCache();
    return doc.toObject();
};

export const deleteHoliday = async (id) => {
    const doc = await DMBPlatformHoliday.findById(id);
    if (!doc) throw new Error('Holiday not found');
    if (doc.status === 'confirmed' && doc.date < localToday()) throw new Error('A past holiday is part of the record and cannot be deleted');
    // Subscriptions extended for this date keep their extra day (customers are never shortened retroactively);
    // orders for the date are generated again on demand once the holiday is gone.
    await doc.deleteOne();
    invalidateHolidayCache();
    return { deleted: true };
};

/** Confirms a holiday and applies it straight away (idempotent). */
export const confirmHoliday = async (id, admin) => {
    const doc = await DMBPlatformHoliday.findById(id);
    if (!doc) throw new Error('Holiday not found');
    if (doc.status !== 'confirmed') {
        doc.status = 'confirmed';
        doc.confirmedBy = admin?._id || null;
        doc.confirmedAt = new Date();
        await doc.save();
    }
    invalidateHolidayCache();
    if (!doc.appliedAt && doc.date >= localToday()) await applyHoliday(doc);
    return DMBPlatformHoliday.findById(id).lean();
};

/**
 * Removes deliveries/shifts on the date and extends each affected subscription by one delivery day per lost delivery
 * day. Safe to re-run: it only acts once (appliedAt).
 */
export const applyHoliday = async (holiday) => {
    const [{ DMBSubscription }, { DMBDailyOrder }, { ShiftRecord }, slotSvc] = await Promise.all([
        import('../subscription/subscription.model.js'),
        import('../subscription/dmb.dailyOrder.model.js'),
        import('../../food/delivery/models/shiftRecord.model.js'),
        import('../deliverySlot/deliverySlot.service.js')
    ]);
    const { deliveriesOn, extendEndDateByDeliveries } = await import('../subscription/schedule.js');
    const date = new Date(holiday.date);
    const zoneIds = holiday.scope === 'city' ? await zoneIdsForCity(holiday.cityId) : null;
    const slotDefs = await slotSvc.listSlots();

    const subFilter = { status: { $in: ['active', 'paused'] }, startDate: { $lte: date }, $or: [{ endDate: null }, { endDate: { $gt: date } }] };
    if (zoneIds) subFilter.zoneId = { $in: zoneIds };
    const subs = await DMBSubscription.find(subFilter);

    let affected = 0;
    for (const sub of subs) {
        const lost = deliveriesOn(sub.toObject(), date, { slotDefs, ignoreBounds: true });
        if (!lost.length) continue;
        if (sub.endDate) {
            const holidays = await holidaySetForZone(sub.zoneId);
            holidays.add(storageDateStr(date));
            sub.endDate = extendEndDateByDeliveries(sub.toObject(), 1, { slotDefs, holidays });
        }
        sub.holidayExtensions = (sub.holidayExtensions || 0) + 1;
        await sub.save();
        affected++;
    }

    const orderFilter = { deliveryDate: date, status: 'scheduled' };
    if (zoneIds) orderFilter.subscriptionId = { $in: subs.map((s) => s._id) };
    await DMBDailyOrder.deleteMany(orderFilter);

    const shiftFilter = { date, status: { $in: ['scheduled', 'confirmed'] } };
    if (zoneIds) {
        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        const driverIds = await FoodDeliveryPartner.find({ zoneIds: { $in: zoneIds } }).distinct('_id').catch(() => []);
        shiftFilter.driverId = { $in: driverIds };
    }
    await ShiftRecord.updateMany(shiftFilter, { $set: { status: 'holiday', holidayName: holiday.name } });

    await DMBPlatformHoliday.updateOne({ _id: holiday._id }, { $set: { appliedAt: new Date(), affectedSubscriptions: affected } });
    logger.info(`[holidays] Applied ${storageDateStr(date)} (${holiday.name}): ${affected} subscriptions extended`);
    return { affected };
};

// ─── Communication job (7 days and 3 days before) ────────────────────────────────────────────────────────

export const sendHolidayNotices = async (now = new Date()) => {
    const today = localToday(now);
    const upcoming = await DMBPlatformHoliday.find({ status: 'confirmed', date: { $gte: today, $lte: addDays(today, 7) } }).lean();
    const { notifyHoliday } = await import('./holiday.notify.js');
    let sent = 0;
    for (const h of upcoming) {
        const daysAway = Math.round((new Date(h.date).getTime() - today.getTime()) / 86_400_000);
        if (daysAway <= 7 && !h.notified7At) {
            await DMBPlatformHoliday.updateOne({ _id: h._id }, { $set: { notified7At: new Date() } });
            await notifyHoliday(h, { kind: 'week' });
            sent++;
        } else if (daysAway <= 3 && !h.notified3At) {
            await DMBPlatformHoliday.updateOne({ _id: h._id }, { $set: { notified3At: new Date() } });
            await notifyHoliday(h, { kind: 'reminder' });
            sent++;
        }
        if (!h.appliedAt) await applyHoliday(h);
    }
    return { sent };
};
