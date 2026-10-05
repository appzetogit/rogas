import mongoose from 'mongoose';
import { VendorSubscriptionPlan } from './vendorSubscriptionPlan.model.js';
import { DMBSubscription } from './subscription.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { quoteSubscription, subscriptionFieldsFromQuote, QuoteError, vendorServesZone } from './pricing.service.js';
import { assertAddressInZone, coordsOf } from '../zones/zoneGeo.service.js';
import { deliveriesOn, buildPeriod } from './schedule.js';
import { addDays, dateOnlyFromStr, localToday, storageDateStr } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Creating subscriptions from a server quote (new checkout), plus the change flows of Gap S:
 *   upgrade / downgrade (change of billing cycle), switch vendor, add a delivery slot.
 * A change always creates a *new* pending subscription the customer pays for; only when that payment succeeds is the
 * old one shortened (applyPendingChange). Delivery address, per-day addresses and invoice preference carry over.
 */

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const normalizeAddress = (a) => {
    if (!a) return null;
    if (typeof a === 'string') return { street: a, city: 'Local', state: 'Local', label: 'Home' };
    const c = coordsOf(a);
    return {
        label: ['Home', 'Office', 'Other'].includes(a.label) ? a.label : 'Home',
        customLabel: String(a.customLabel || '').slice(0, 30),
        fullName: a.fullName || '',
        street: a.street || a.address || a.formattedAddress || '',
        additionalDetails: a.additionalDetails || '',
        city: a.city || 'Local',
        state: a.state || 'Local',
        zipCode: a.zipCode || '',
        phone: a.phone || '',
        location: c ? { type: 'Point', coordinates: [c.lng, c.lat] } : undefined,
        addressId: a.addressId || a._id || null
    };
};

/** Resolves an address given as a saved addressId or an inline object, and zone-checks it (Gap U). */
const resolveAddress = async (userId, ref, { source }) => {
    let addr = ref;
    if (typeof ref === 'string' && mongoose.Types.ObjectId.isValid(ref)) {
        const user = await FoodUser.findById(userId).select('addresses').lean();
        const saved = (user?.addresses || []).find((a) => String(a._id) === ref);
        if (!saved) throw new QuoteError('Saved address not found');
        addr = { ...saved, addressId: saved._id };
    }
    const out = normalizeAddress(addr);
    if (!out?.street) throw new QuoteError('Delivery address is required');
    const zone = await assertAddressInZone(out, { source, userId });
    out.zoneId = zone.zoneId;
    return out;
};

const assertNotBlocked = async (userId) => {
    const user = await FoodUser.findById(userId).select('badDebt role deliveryAddress city').lean();
    if (user?.badDebt?.subscriptionBlocked) {
        throw new QuoteError('New subscriptions are blocked on this account. Please contact customer support.', 'ACCOUNT_BLOCKED', 403);
    }
    return user;
};

/**
 * Validates and creates a pending_payment subscription from a quote request.
 * params: { userId, input (quote input), deliveryAddress, dayAddresses: [{ day, address|addressId }],
 *           expectedTotal, paymentMethod, invoice: { invoiceType, companyNip, companyName, billingEmail }, extra }
 */
export const createPendingSubscription = async ({ userId, input, deliveryAddress, dayAddresses, expectedTotal, paymentMethod, invoice = {}, extra = {} }) => {
    const user = await assertNotBlocked(userId);
    const quote = await quoteSubscription(input, { userId });
    if (expectedTotal !== undefined && expectedTotal !== null && Math.abs(Number(expectedTotal) - quote.totals.total) > 0.01) {
        const err = new QuoteError('The price has changed. Please review the new total and confirm again.', 'PRICE_CHANGED', 409);
        err.quote = quote;
        throw err;
    }

    let address;
    if (user?.role === 'EMPLOYEE' && user?.deliveryAddress) {
        // Employees always get the company's central delivery address.
        address = { street: user.deliveryAddress, city: user.city || 'Local', state: 'Local', label: 'Office', zoneId: quote.zoneId };
    } else {
        address = await resolveAddress(userId, deliveryAddress, { source: 'checkout' });
        if (String(address.zoneId) !== String(quote.zoneId)) {
            throw new QuoteError('Your delivery address is in a different zone than the one selected. Choose the zone of your address.', 'ZONE_MISMATCH');
        }
    }

    let perDay;
    if (Array.isArray(dayAddresses) && dayAddresses.length) {
        perDay = [];
        for (const entry of dayAddresses) {
            const day = Number(entry.day);
            if (!quote.deliveryDaysList.includes(day)) continue;
            const a = await resolveAddress(userId, entry.addressId || entry.address, { source: 'checkout' });
            // The maker delivering that day must serve the day's address zone.
            const vendorId = quote.subscriptionType === 'rotation' ? quote.rotation.find((r) => r.days.includes(day))?.vendorId : quote.vendorId;
            const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
            const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName zoneId deliveryZoneIds').lean();
            if (!vendorServesZone(vendor, a.zoneId)) throw new QuoteError(`${vendor?.restaurantName || 'This maker'} does not deliver to the address chosen for that day`, 'ZONE_MISMATCH');
            perDay.push({ day, addressId: a.addressId || null, address: a });
        }
    }

    const fields = subscriptionFieldsFromQuote(quote);
    const sub = await DMBSubscription.create({
        userId,
        zoneId: quote.zoneId,
        ...fields,
        deliveryAddress: address,
        dayAddresses: perDay?.length ? perDay : undefined,
        paymentMethod: paymentMethod || 'razorpay',
        invoiceType: invoice.invoiceType === 'vat' ? 'b2b_vat' : (invoice.invoiceType === 'simple' ? 'receipt' : (invoice.invoiceType || 'receipt')),
        companyNip: invoice.companyNip || '',
        companyName: invoice.companyName || '',
        billingEmail: invoice.billingEmail || '',
        status: 'pending_payment',
        ...extra
    });
    return { subscription: sub, quote };
};

// ─── Gap S: change flows ───────────────────────────────────────────────────────────────────────────────

const CYCLE_RANK = { one_day: 0, weekly: 1, fortnightly: 2, monthly: 3, annual: 4 };

const nextMonday = (from = localToday()) => {
    const dow = from.getUTCDay();
    return addDays(from, ((8 - dow) % 7) || 7);
};

/** Paid-but-undelivered value of a subscription from `from` (exclusive end at its endDate): the downgrade/switch credit. */
export const unusedValue = async (sub, from) => {
    const { DMBDailyOrder } = await import('./dmb.dailyOrder.model.js');
    const { priceDailyOrder } = await import('./pricing.service.js');
    const { listSlots } = await import('../deliverySlot/deliverySlot.service.js');
    const { holidaySetForZone } = await import('../platform/holiday.service.js');
    if (!sub.endDate || from >= new Date(sub.endDate)) return { amount: 0, deliveries: 0 };
    const slotDefs = await listSlots();
    const holidays = await holidaySetForZone(sub.zoneId);
    const skipped = new Set((await DMBDailyOrder.find({ subscriptionId: sub._id, deliveryDate: { $gte: from }, status: 'skipped' }).select('deliveryDate deliverySlot').lean())
        .map((o) => `${storageDateStr(o.deliveryDate)}|${o.deliverySlot}`));
    let amount = 0;
    let deliveries = 0;
    for (let d = new Date(from); d < new Date(sub.endDate); d = addDays(d, 1)) {
        for (const dv of deliveriesOn(sub, d, { slotDefs, holidays })) {
            if (skipped.has(`${storageDateStr(d)}|${dv.slot}`)) continue; // already credited when skipped
            amount += priceDailyOrder(sub, d, dv).totalPrice;
            deliveries++;
        }
    }
    return { amount: r2(amount), deliveries };
};

const findOwned = async (userId, id) => {
    const or = [{ subscriptionId: id }];
    if (mongoose.Types.ObjectId.isValid(String(id))) or.push({ _id: id });
    const sub = await DMBSubscription.findOne({ userId, $or: or });
    if (!sub) throw new QuoteError('Subscription not found', 'NOT_FOUND', 404);
    return sub;
};

/**
 * What a change would look like, before paying: effective date, credit to the wallet, and the new subscription's quote.
 * type: 'change_plan' (new subscriptionPlanId) | 'switch_vendor' (vendorId + meals) | 'add_slot' (deliverySlots, vendor, meals)
 */
export const previewChange = async ({ userId, subscriptionId, type, input = {} }) => {
    const sub = await findOwned(userId, subscriptionId);
    if (!['active', 'paused'].includes(sub.status)) throw new QuoteError('Only an active or paused subscription can be changed');
    if (sub.planChangePending?.newSubscriptionId && type !== 'renew') throw new QuoteError('A change is already scheduled for this subscription', 'CHANGE_PENDING');
    if (type === 'renew' && sub.renewedBySubscriptionId) throw new QuoteError('This subscription has already been renewed', 'ALREADY_RENEWED');
    const today = localToday();
    const currentEnd = sub.endDate ? new Date(sub.endDate) : null;
    const base = {
        vendorId: String(sub.vendorId),
        zoneId: String(sub.zoneId || ''),
        meals: (sub.meals || []).map((m) => ({ mealPlanId: String(m.mealPlanId), quantity: m.quantity })),
        deliverySlots: sub.deliverySlots?.length ? sub.deliverySlots : [sub.deliverySlot],
        deliveryDays: sub.deliveryDays,
        deliveryDaysList: sub.deliveryDaysList,
        daySlots: sub.daySlots,
        subscriptionType: sub.subscriptionType,
        rotation: sub.rotation?.map((r) => ({ vendorId: String(r.vendorId), mealPlanId: String(r.mealPlanId), quantity: r.quantity, days: r.days })),
        familyBox: sub.familyBox?.enabled ? sub.familyBox : undefined,
        subscriptionPlanId: String(sub.subscriptionPlanId || '')
    };

    let effective;
    let changeType;
    let quoteInput;
    if (type === 'change_plan') {
        if (!input.subscriptionPlanId) throw new QuoteError('Choose the new plan');
        quoteInput = { ...base, subscriptionPlanId: input.subscriptionPlanId, replacesSubscriptionId: String(sub._id) };
        const probe = await quoteSubscription({ ...quoteInput, startDate: storageDateStr(addDays(today, 1)) }, { userId });
        const newRank = CYCLE_RANK[probe.cycle] ?? 1;
        const oldRank = CYCLE_RANK[sub.billingCycle || sub.duration] ?? 1;
        if (newRank > oldRank) {
            changeType = 'upgrade';
            // Upgrades take effect at the next billing cycle — the current period runs to its end.
            effective = currentEnd && currentEnd > today ? currentEnd : addDays(today, 1);
        } else if (newRank < oldRank) {
            changeType = 'downgrade';
            // Downgrades start next Monday; unused prepaid days are credited to the wallet.
            effective = nextMonday(today);
            if (currentEnd && currentEnd < effective) effective = currentEnd;
        } else {
            changeType = 'change_plan';
            effective = currentEnd && currentEnd > today ? currentEnd : addDays(today, 1);
        }
    } else if (type === 'switch_vendor') {
        if (!input.vendorId || !Array.isArray(input.meals) || !input.meals.length) throw new QuoteError('Choose the new maker and a meal');
        changeType = 'switch_vendor';
        effective = nextMonday(today);
        if (currentEnd && currentEnd < effective) effective = currentEnd;
        // Plans belong to a maker: moving to another maker means taking that maker's plan with the same duration and days.
        let planForNewMaker = input.subscriptionPlanId || base.subscriptionPlanId;
        const currentPlan = planForNewMaker ? await VendorSubscriptionPlan.findById(planForNewMaker).select('vendorId duration deliveryDays').lean() : null;
        if (currentPlan?.vendorId && String(currentPlan.vendorId) !== String(input.vendorId)) {
            const sameShape = { vendorId: input.vendorId, status: 'active', duration: currentPlan.duration };
            const match = await VendorSubscriptionPlan.findOne({ ...sameShape, deliveryDays: currentPlan.deliveryDays }).lean() || await VendorSubscriptionPlan.findOne(sameShape).lean();
            if (!match) throw new QuoteError('This maker does not offer a plan with the same duration yet. Choose another maker.', 'PLAN_UNAVAILABLE');
            planForNewMaker = String(match._id);
        }
        quoteInput = { ...base, subscriptionType: 'dedicated', rotation: undefined, familyBox: undefined, vendorId: input.vendorId, meals: input.meals, subscriptionPlanId: planForNewMaker, deliverySlots: input.deliverySlots || base.deliverySlots, replacesSubscriptionId: String(sub._id) };
    } else if (type === 'renew') {
        // Renewal: same plan and preferences for the next period, starting when the current one ends.
        changeType = 'renew';
        effective = currentEnd && currentEnd > today ? currentEnd : addDays(today, 1);
        quoteInput = {
            ...base,
            subscriptionPlanId: input.subscriptionPlanId || base.subscriptionPlanId,
            rotation: sub.pendingRotation?.length ? sub.pendingRotation.map((r) => ({ vendorId: String(r.vendorId), mealPlanId: String(r.mealPlanId), quantity: r.quantity, days: r.days })) : base.rotation
        };
    } else if (type === 'add_slot') {
        if (!Array.isArray(input.deliverySlots) || !input.deliverySlots.length) throw new QuoteError('Choose the slot to add');
        changeType = 'add_slot';
        effective = input.startDate ? dateOnlyFromStr(input.startDate) : addDays(today, 1);
        quoteInput = {
            ...base, subscriptionType: 'dedicated', rotation: undefined, familyBox: undefined, daySlots: undefined,
            vendorId: input.vendorId || base.vendorId, meals: input.meals?.length ? input.meals : base.meals,
            deliverySlots: input.deliverySlots, subscriptionPlanId: input.subscriptionPlanId || base.subscriptionPlanId
        };
    } else {
        throw new QuoteError('Unknown change type');
    }
    if (!effective || effective <= today) effective = addDays(today, 1);
    const quote = await quoteSubscription({ ...quoteInput, startDate: storageDateStr(effective) }, { userId });
    const credit = ['downgrade', 'switch_vendor'].includes(changeType) ? await unusedValue(sub, effective) : { amount: 0, deliveries: 0 };
    return {
        changeType,
        effectiveDate: storageDateStr(effective),
        currentEndDate: currentEnd ? storageDateStr(currentEnd) : null,
        credit,
        quote,
        quoteInput: { ...quoteInput, startDate: storageDateStr(effective) },
        notice: changeType === 'upgrade' || changeType === 'change_plan'
            ? 'Changes take effect at the next billing cycle.'
            : changeType === 'downgrade'
                ? 'You will lose the remaining prepaid days of your current plan; their value is added to your wallet.'
                : changeType === 'switch_vendor'
                    ? 'Your current maker delivers until the switch date; unused prepaid days are added to your wallet.'
                    : changeType === 'renew'
                        ? 'Your next period starts when the current one ends.'
                        : 'The new slot is a separate subscription, billed on its own.'
    };
};

/** Creates the replacement subscription (pending payment). The old one changes only after payment (applyPendingChange). */
export const createChangeSubscription = async ({ userId, subscriptionId, type, input = {}, expectedTotal, paymentMethod }) => {
    const preview = await previewChange({ userId, subscriptionId, type, input });
    const old = await findOwned(userId, subscriptionId);
    const { subscription, quote } = await createPendingSubscription({
        userId,
        input: preview.quoteInput,
        deliveryAddress: old.deliveryAddress?.addressId ? String(old.deliveryAddress.addressId) : old.deliveryAddress?.toObject?.() || old.deliveryAddress,
        dayAddresses: preview.changeType === 'add_slot' ? undefined : (old.dayAddresses || []).map((d) => ({ day: d.day, addressId: d.addressId ? String(d.addressId) : undefined, address: d.address })),
        expectedTotal,
        paymentMethod,
        invoice: { invoiceType: old.invoiceType, companyNip: old.companyNip, companyName: old.companyName, billingEmail: old.billingEmail },
        extra: {
            changeType: preview.changeType,
            replacesSubscriptionId: ['add_slot', 'renew'].includes(preview.changeType) ? null : old._id,
        ...(preview.changeType === 'renew' ? { renewsSubscriptionId: old._id } : {}),
            userPreferencesCarryOver: true
        }
    });
    return { subscription, quote, preview };
};

/**
 * Called when the replacement subscription is paid: the old one stops at the effective date, unused value is credited
 * (downgrade / switch), and both are linked. Idempotent.
 */
export const applyPendingChange = async (newSub) => {
    if (!newSub?.replacesSubscriptionId) return null;
    const old = await DMBSubscription.findById(newSub.replacesSubscriptionId);
    if (!old || String(old.replacedBySubscriptionId || '') === String(newSub._id)) return null;
    const effective = new Date(newSub.startDate);
    let credit = 0;
    if (['downgrade', 'switch_vendor'].includes(newSub.changeType)) {
        credit = (await unusedValue(old, effective)).amount;
    }
    old.replacedBySubscriptionId = newSub._id;
    old.planChangePending = { changeType: newSub.changeType, newSubscriptionId: newSub._id, effectiveDate: effective, creditAmount: credit };
    if (!old.endDate || effective < new Date(old.endDate)) old.endDate = effective;
    old.cancelAt = effective;
    old.autoRenew = false;
    await old.save();

    const { DMBDailyOrder } = await import('./dmb.dailyOrder.model.js');
    await DMBDailyOrder.deleteMany({ subscriptionId: old._id, deliveryDate: { $gte: effective }, status: 'scheduled' });

    if (credit > 0) {
        try {
            const { refundWalletBalance } = await import('../../food/user/services/userWallet.service.js');
            await refundWalletBalance(old.userId, credit, `Unused days of ${old.subscriptionId} (${newSub.changeType === 'switch_vendor' ? 'maker switch' : 'plan downgrade'})`, { subscriptionId: old._id });
        } catch (err) {
            logger.error(`[plan-change] wallet credit failed for ${old.subscriptionId}: ${err.message}`);
        }
    }
    logger.info(`[plan-change] ${old.subscriptionId} → ${newSub.subscriptionId} (${newSub.changeType}) effective ${storageDateStr(effective)}, credit ${credit}`);
    return { old, credit };
};

/** Job: subscriptions whose end date has passed become "expired" (cancelAt-ended ones become "cancelled"). */
export const expireEndedSubscriptions = async (now = new Date()) => {
    const today = localToday(now);
    const ended = await DMBSubscription.find({ status: { $in: ['active', 'paused'] }, endDate: { $ne: null, $lte: today } });
    let expired = 0;
    for (const sub of ended) {
        // Customer-cancelled subscriptions end as "cancelled" (not "expired") once their paid period is over.
        const customerCancelled = Boolean(sub.cancelRequestedAt) && !sub.replacedBySubscriptionId;
        sub.status = sub.replacedBySubscriptionId || customerCancelled ? 'cancelled' : 'expired';
        sub.expiredAt = now;
        if (customerCancelled && !sub.cancelledAt) sub.cancelledAt = now;
        if (sub.replacedBySubscriptionId && !sub.cancelledAt) {
            sub.cancelledAt = now;
            sub.cancellationReason = `Replaced by a ${sub.planChangePending?.changeType || 'plan change'}`;
        }
        await sub.save();
        expired++;
        const live = await DMBSubscription.exists({ userId: sub.userId, status: { $in: ['active', 'paused'] } });
        if (!live) await FoodUser.updateOne({ _id: sub.userId }, { subscriptionStatus: customerCancelled ? 'cancelled' : 'none' });
    }
    return { expired };
};

/** Previewing delivery dates for a period is also handy for the UI (e.g. fortnight shading). */
export const previewPeriodDates = (sub, cycle, opts) => buildPeriod(sub, { cycle, ...opts }).dates.map((d) => storageDateStr(d.date));
