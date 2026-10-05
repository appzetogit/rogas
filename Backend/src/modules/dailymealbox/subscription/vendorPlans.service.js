import mongoose from 'mongoose';
import { ValidationError } from '../../../core/auth/errors.js';
import { VendorSubscriptionPlan } from './vendorSubscriptionPlan.model.js';
import { DMBSubscription } from './subscription.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { getCityVatRates } from '../../food/admin/services/cityVat.service.js';

/**
 * Vendor-owned subscription plans. The vendor chooses the name, duration, delivery days, description and an optional
 * discount; VAT and the platform fee are platform terms the vendor cannot change (see platformTermsFor).
 */

export const PLAN_DURATIONS = ['day', 'week', 'month'];
export const MAX_PLANS_PER_VENDOR = 12;

export const daysCountFor = (duration, deliveryDays) => {
    const monFri = deliveryDays === 'mon_fri';
    return duration === 'day' ? 1 : duration === 'week' ? (monFri ? 5 : 7) : (monFri ? 20 : 30);
};

const clean = (v) => (typeof v === 'string' ? v.trim() : '');

/**
 * VAT rates and platform fee for a new plan: the platform's own plan of the same duration when one exists (the VAT policy
 * admin configured), otherwise the VAT rates of the vendor's city. There is no invented default: when neither exists the
 * vendor is asked to wait until admin has set the city VAT.
 */
export const platformTermsFor = async (duration, vendor) => {
    const template = await VendorSubscriptionPlan.findOne({ vendorId: null, status: 'active', duration }).sort({ createdAt: 1 }).lean();
    if (template) {
        return {
            foodVat: Number(template.foodVat) || 0,
            deliveryVat: Number(template.deliveryVat) || 0,
            platformFee: Number(template.platformFee) || 0,
            applyFoodVatOnMenu: Boolean(template.applyFoodVatOnMenu)
        };
    }
    const { rates } = await getCityVatRates({ zoneId: vendor?.zoneId, cityName: vendor?.city }, ['foodRestaurant', 'delivery']);
    return { foodVat: rates.foodRestaurant, deliveryVat: rates.delivery, platformFee: 0, applyFoodVatOnMenu: false };
};

/**
 * Platform fee charged once per subscription. Admin can set one fee for all plans (Admin Controls); while that control is
 * off, each plan keeps the fee stored on it.
 */
export const effectivePlatformFee = async (plan) => {
    const { getControl } = await import('../platform/platformConfig.service.js');
    const ctl = await getControl('subscriptionPlatformFee');
    return ctl.enabled ? Number(ctl.amount) || 0 : Number(plan?.platformFee) || 0;
};

/**
 * A vendor with no plans of their own (e.g. just approved) gets a copy of each active platform plan, so customers can
 * subscribe right away; the vendor can then edit or delete them. Does nothing when the vendor already has plans.
 */
export const giveStarterPlans = async (vendorId) => {
    if (await VendorSubscriptionPlan.exists({ vendorId })) return 0;
    const templates = await VendorSubscriptionPlan.find({ vendorId: null, status: 'active' }).lean();
    for (const t of templates) {
        await VendorSubscriptionPlan.create({
            vendorId, copiedFromId: t._id, name: t.name, duration: t.duration, deliveryDays: t.deliveryDays, daysCount: t.daysCount,
            description: t.description, features: t.features, foodVat: t.foodVat, deliveryVat: t.deliveryVat, platformFee: t.platformFee,
            applyFoodVatOnMenu: t.applyFoodVatOnMenu, discountPercent: 0, status: 'active'
        });
    }
    return templates.length;
};

const readFields = (body, { partial = false } = {}) => {
    const out = {};
    if (!partial || body.name !== undefined) {
        const name = clean(body.name);
        if (!name) throw new ValidationError('Plan name is required');
        if (name.length > 60) throw new ValidationError('Plan name can be at most 60 characters');
        out.name = name;
    }
    if (!partial || body.duration !== undefined) {
        const duration = clean(body.duration).toLowerCase();
        if (!PLAN_DURATIONS.includes(duration)) throw new ValidationError('Duration must be day, week or month');
        out.duration = duration;
    }
    if (!partial || body.deliveryDays !== undefined) {
        const deliveryDays = clean(body.deliveryDays) || 'full_week';
        if (!['mon_fri', 'full_week'].includes(deliveryDays)) throw new ValidationError('Delivery days must be Monday to Friday or the full week');
        out.deliveryDays = deliveryDays;
    }
    if (!partial || body.description !== undefined) {
        const description = clean(body.description);
        if (description.length > 500) throw new ValidationError('Description can be at most 500 characters');
        out.description = description;
    }
    if (!partial || body.features !== undefined) {
        const features = Array.isArray(body.features) ? body.features.map(clean).filter(Boolean) : [];
        if (features.length > 10 || features.some((f) => f.length > 80)) throw new ValidationError('A plan can list at most 10 features of up to 80 characters each');
        out.features = features;
    }
    if (!partial || body.discountPercent !== undefined) {
        const raw = body.discountPercent === '' || body.discountPercent === null || body.discountPercent === undefined ? 0 : Number(body.discountPercent);
        if (!Number.isFinite(raw) || raw < 0 || raw > 50) throw new ValidationError('Discount must be between 0 and 50 %');
        out.discountPercent = Math.round(raw * 100) / 100;
    }
    if (body.status !== undefined) {
        if (!['active', 'inactive'].includes(body.status)) throw new ValidationError('Status must be active or inactive');
        out.status = body.status;
    }
    return out;
};

const ownedPlan = async (vendorId, planId) => {
    if (!mongoose.Types.ObjectId.isValid(String(planId))) throw new ValidationError('Invalid plan id');
    const plan = await VendorSubscriptionPlan.findOne({ _id: planId, vendorId });
    if (!plan) throw new ValidationError('Plan not found');
    return plan;
};

const IN_USE = ['active', 'paused', 'pending_payment'];

export const listVendorPlans = async (vendorId) => {
    const plans = await VendorSubscriptionPlan.find({ vendorId }).sort({ createdAt: -1 }).lean();
    const counts = await DMBSubscription.aggregate([
        { $match: { subscriptionPlanId: { $in: plans.map((p) => p._id) }, status: { $in: IN_USE } } },
        { $group: { _id: '$subscriptionPlanId', n: { $sum: 1 } } }
    ]);
    const byPlan = new Map(counts.map((c) => [String(c._id), c.n]));
    return plans.map((p) => ({ ...p, subscribers: byPlan.get(String(p._id)) || 0 }));
};

export const createVendorPlan = async (vendorId, body = {}) => {
    const fields = readFields(body);
    const count = await VendorSubscriptionPlan.countDocuments({ vendorId });
    if (count >= MAX_PLANS_PER_VENDOR) throw new ValidationError(`You can have at most ${MAX_PLANS_PER_VENDOR} plans. Delete one you no longer need first.`);
    const vendor = await FoodRestaurant.findById(vendorId).select('zoneId city').lean();
    if (!vendor) throw new ValidationError('Vendor not found');
    const terms = await platformTermsFor(fields.duration, vendor);
    const plan = await VendorSubscriptionPlan.create({
        ...fields,
        ...terms,
        vendorId,
        daysCount: daysCountFor(fields.duration, fields.deliveryDays),
        status: fields.status || 'active'
    });
    return plan.toObject();
};

export const updateVendorPlan = async (vendorId, planId, body = {}) => {
    const plan = await ownedPlan(vendorId, planId);
    const fields = readFields(body, { partial: true });
    const changesShape = (fields.duration && fields.duration !== plan.duration) || (fields.deliveryDays && fields.deliveryDays !== plan.deliveryDays);
    if (changesShape && await DMBSubscription.exists({ subscriptionPlanId: plan._id, status: { $in: IN_USE } })) {
        throw new ValidationError('Customers are subscribed to this plan, so its duration and delivery days cannot change. Create a new plan instead.');
    }
    Object.assign(plan, fields);
    plan.daysCount = daysCountFor(plan.duration, plan.deliveryDays);
    await plan.save();
    return plan.toObject();
};

/** Deletes a plan nobody ever used; a plan that has subscriptions is only switched off so those keep their history. */
export const deleteVendorPlan = async (vendorId, planId) => {
    const plan = await ownedPlan(vendorId, planId);
    if (await DMBSubscription.exists({ subscriptionPlanId: plan._id })) {
        plan.status = 'inactive';
        await plan.save();
        return { archived: true };
    }
    await plan.deleteOne();
    return { archived: false };
};
