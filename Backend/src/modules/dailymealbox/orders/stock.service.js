import mongoose from 'mongoose';
import { DMBMealStock } from './orders.models.js';
import { localToday, dateOnlyFromStr, storageDateStr } from '../../../utils/platformTime.js';
import { raiseAdminAlert } from '../platform/platformConfig.service.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';

/**
 * Live stock (Gap E). Low-stock alert when more than 80% of the day's portions are cooked or committed; the meal closes
 * for *new* one-off orders (Select, pre-orders) when sold out. Subscription deliveries were committed in advance and
 * are never cancelled by stock.
 */

const LOW_STOCK_RATIO = 0.8;
const dayOf = (date) => (date ? (typeof date === 'string' ? dateOnlyFromStr(date) : new Date(storageDateStr(date))) : localToday());

/** Portions already promised for a meal on a day: every non-skipped/failed order containing it. */
export const committedPortions = async (mealPlanId, date) => {
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const [row] = await DMBDailyOrder.aggregate([
        { $match: { deliveryDate: date, status: { $nin: ['skipped', 'failed'] }, 'meals.mealPlanId': new mongoose.Types.ObjectId(String(mealPlanId)) } },
        { $unwind: '$meals' },
        { $match: { 'meals.mealPlanId': new mongoose.Types.ObjectId(String(mealPlanId)) } },
        { $group: { _id: null, n: { $sum: '$meals.quantity' } } }
    ]);
    return row?.n || 0;
};

const stockRow = async (meal, date) => {
    const doc = await DMBMealStock.findOne({ mealPlanId: meal._id, date }).lean();
    const available = doc ? doc.available : Number(meal.capacity) || 0;
    const prepared = doc?.prepared || 0;
    const committed = await committedPortions(meal._id, date);
    const used = Math.max(prepared, committed);
    const remaining = Math.max(0, available - used);
    const soldOut = available > 0 ? used >= available : true;
    return {
        mealPlanId: meal._id, name: meal.name, photo: meal.photos?.[0] || '', date: storageDateStr(date),
        available, prepared, committed, remaining, remainingPct: available ? Math.round((remaining / available) * 100) : 0,
        status: soldOut ? 'sold_out' : (available && used / available > LOW_STOCK_RATIO ? 'low' : 'open'),
        lowStock: Boolean(available && used / available > LOW_STOCK_RATIO), soldOut
    };
};

export const vendorStock = async (vendorId, { date } = {}) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const day = dayOf(date);
    const meals = await DMBMealPlan.find({ vendorId, status: { $in: ['active', 'pre_order'] } }).select('name capacity photos').lean();
    const rows = [];
    for (const meal of meals) rows.push(await stockRow(meal, day));
    return { date: storageDateStr(day), meals: rows };
};

const syncStatus = async (meal, day) => {
    const row = await stockRow(meal, day);
    await DMBMealStock.updateOne(
        { mealPlanId: meal._id, date: day },
        { $set: { status: row.soldOut ? 'sold_out' : 'open', soldOutAt: row.soldOut ? new Date() : null } }
    );
    return row;
};

const ownMeal = async (vendorId, mealPlanId) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const meal = await DMBMealPlan.findOne({ _id: mealPlanId, vendorId }).select('name capacity photos').lean();
    if (!meal) throw Object.assign(new Error('Meal not found'), { statusCode: 404 });
    return meal;
};

export const setAvailable = async (vendorId, mealPlanId, { available, date }) => {
    const n = Math.floor(Number(available));
    if (!Number.isFinite(n) || n < 0 || n > 5000) throw new Error('Available portions must be between 0 and 5000');
    const meal = await ownMeal(vendorId, mealPlanId);
    const day = dayOf(date);
    if (day < localToday()) throw new Error('Past days cannot be changed');
    await DMBMealStock.updateOne({ mealPlanId, date: day }, { $set: { vendorId, available: n }, $setOnInsert: { prepared: 0 } }, { upsert: true });
    return syncStatus(meal, day);
};

/** The vendor counts cooked portions up (delta) or sets the count (value). */
export const recordPrepared = async (vendorId, mealPlanId, { delta, value, date }) => {
    const meal = await ownMeal(vendorId, mealPlanId);
    const day = dayOf(date);
    let doc = await DMBMealStock.findOne({ mealPlanId, date: day });
    if (!doc) doc = new DMBMealStock({ vendorId, mealPlanId, date: day, available: Number(meal.capacity) || 0, prepared: 0 });
    const next = value !== undefined ? Math.floor(Number(value)) : doc.prepared + Math.floor(Number(delta) || 0);
    if (!Number.isFinite(next) || next < 0) throw new Error('Invalid portion count');
    doc.prepared = Math.min(next, 10000);
    await doc.save();
    return syncStatus(meal, day);
};

/** Can `quantity` more portions of this meal be sold for that day? */
export const canSell = async (meal, date, quantity = 1) => {
    const row = await stockRow(meal, date);
    return { ok: !row.soldOut && row.remaining >= quantity, remaining: row.remaining, soldOut: row.soldOut };
};

/** Job (every 15 min): today's meals past 80% → vendor push (once a day per meal) + AP-11 alert. */
export const lowStockSweep = async () => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const today = localToday();
    const meals = await DMBMealPlan.find({ status: 'active' }).select('name capacity vendorId photos').lean();
    let alerted = 0;
    for (const meal of meals) {
        const row = await stockRow(meal, today);
        if (!row.lowStock || !row.available) continue;
        const res = await DMBMealStock.updateOne(
            { mealPlanId: meal._id, date: today, lowStockAlertedAt: null },
            { $set: { lowStockAlertedAt: new Date(), vendorId: meal.vendorId }, $setOnInsert: { available: row.available, prepared: row.prepared } },
            { upsert: true }
        ).catch((e) => (e.code === 11000 ? { modifiedCount: 0, upsertedCount: 0 } : Promise.reject(e)));
        if (!(res.modifiedCount || res.upsertedCount)) continue;
        alerted++;
        await notify({
            to: 'vendor', id: meal.vendorId, event: 'low_stock',
            title: msg('Low stock: {{meal}}', { meal: meal.name }),
            body: msg('Only {{n}} {{meal}} portions left — accept more orders?', { n: row.remaining, meal: meal.name }),
            data: { mealPlanId: String(meal._id) }
        });
        await raiseAdminAlert({
            type: 'low_stock', severity: row.soldOut ? 'warning' : 'info',
            title: `Low stock: ${meal.name}`, message: `${row.remaining} of ${row.available} portions left today`,
            entityType: 'DMBMealPlan', entityId: meal._id, link: '/admin/food/dmb/stock', dedupeKey: `low_stock:${meal._id}:${storageDateStr(today)}`
        });
    }
    return { alerted };
};

/** AP-11 "Today's Stock Status": every meal with portions today, lowest remaining first. */
export const stockStatusReport = async ({ date, zoneIds } = {}) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const day = dayOf(date);
    const vendorFilter = { status: 'approved' };
    if (zoneIds?.length) vendorFilter.zoneId = { $in: zoneIds };
    const vendors = await FoodRestaurant.find(vendorFilter).select('restaurantName').lean();
    const vendorName = new Map(vendors.map((v) => [String(v._id), v.restaurantName]));
    const meals = await DMBMealPlan.find({ vendorId: { $in: vendors.map((v) => v._id) }, status: 'active' }).select('name capacity vendorId photos').lean();
    const rows = [];
    for (const meal of meals) rows.push({ ...(await stockRow(meal, day)), vendorId: meal.vendorId, vendorName: vendorName.get(String(meal.vendorId)) || '' });
    rows.sort((a, b) => a.remainingPct - b.remainingPct);
    return { date: storageDateStr(day), meals: rows };
};
