import mongoose from 'mongoose';
import { OfficeEmployee } from './models/officeEmployee.model.js';
import { OfficeMealAssignment } from './models/officeMealAssignment.model.js';
import { OfficeCompany } from './models/officeCompany.model.js';
import { OfficePayment } from './models/officePayment.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { VendorSubscriptionPlan } from '../subscription/vendorSubscriptionPlan.model.js';
import { quoteSubscription, subscriptionFieldsFromQuote, QuoteError } from '../subscription/pricing.service.js';
import { buildPeriod, cycleFromPlanDuration, deliveryWeekdays } from '../subscription/schedule.js';
import { listSlots, getSlotLabel } from '../deliverySlot/deliverySlot.service.js';
import { detectZone } from '../zones/zoneGeo.service.js';
import { addDays, dateOnlyFromStr, localToday, storageDateStr } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Office (B2B) meal subscriptions.
 *
 * An office buys a plan for several employees in one payment. The price is the server quote a customer subscription of
 * the same plan, meal, slots and start date would get (every delivery day × every slot, delivery fee, VAT, plan
 * discount, platform holidays), once per employee — so the daily orders the vendor and drivers see cost exactly what
 * was paid. Once the payment is confirmed every employee gets their own subscription, delivered to the company's
 * address. An employee may hold several subscriptions (other slots, other vendors, or the next period bought early);
 * a purchase never cancels the employee's other plans.
 */

export class OfficeAssignError extends Error {
    constructor(message, statusCode = 400, code = 'OFFICE_ASSIGN', details = undefined) {
        super(message);
        this.name = 'OfficeAssignError';
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const LIVE = ['active', 'paused'];
// While a payment's employees are being given their subscriptions nobody else may start the same work.
const FULFIL_CLAIM_MS = 10 * 60_000;
const PAYMENT_METHODS = ['razorpay', 'przelewy24', 'stripe'];

// ─── Delivery address ───────────────────────────────────────────────────────

/** The company's delivery address as a subscription address, with its map pin so drivers can navigate to it. */
export const companyDeliveryAddress = (company, zoneId = null) => {
    const raw = String(company?.deliveryAddress || company?.registeredAddress || '').trim();
    const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
    const lat = Number(company?.location?.lat);
    const lng = Number(company?.location?.lng);
    const hasPin = Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0);
    return {
        label: 'Office',
        fullName: company?.legalName || '',
        street: parts[0] || 'Office',
        city: parts[1] || parts[0] || 'Office',
        state: parts[2] || parts[1] || parts[0] || 'Office',
        zipCode: parts[3] || '',
        phone: company?.contactPhone || '',
        location: hasPin ? { type: 'Point', coordinates: [lng, lat] } : undefined,
        zoneId: zoneId || null
    };
};

/** Delivery zone and address of the company. The map pin is required: without it no zone, price or driver route exists. */
export const resolveOfficeDelivery = async (company) => {
    const lat = Number(company?.location?.lat);
    const lng = Number(company?.location?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
        throw new OfficeAssignError('Set your office delivery location (map pin) on the Company Details page first, so we know where to deliver.', 400, 'OFFICE_LOCATION_REQUIRED');
    }
    const zone = await detectZone(lat, lng);
    if (!zone) throw new OfficeAssignError('Your office delivery location is outside our delivery area.', 400, 'OFFICE_OUTSIDE_ZONE');
    return { zoneId: String(zone._id), zoneName: zone.name || zone.zoneName || '', address: companyDeliveryAddress(company, zone._id) };
};

// ─── Conflicts (an employee cannot get two meals in the same slot on the same day) ─────────────

const slotKeysOf = (sub) => new Set([
    ...(sub.deliverySlots || []),
    sub.deliverySlot,
    ...(sub.daySlotKeys || []),
    ...((sub.familyBox?.enabled && sub.familyBox.members) || []).flatMap((m) => m.slots || [])
].filter(Boolean));

/**
 * Employees who already have a meal in one of the new slots, on one of the new delivery days, while the new period
 * runs — from any subscription (company-paid or their own). Returns [{ employeeId, name, slots, vendorName, until }].
 */
export const findSlotConflicts = async ({ employees, quote }) => {
    const byUser = new Map(employees.filter((e) => e.userId).map((e) => [String(e.userId), e]));
    if (!byUser.size) return [];
    const newStart = dateOnlyFromStr(quote.startDate);
    const newEnd = dateOnlyFromStr(quote.endDate);
    const newSlots = new Set(quote.deliverySlots || []);
    const newDays = new Set(quote.deliveryDaysList || []);
    const subs = await DMBSubscription.find({
        userId: { $in: [...byUser.keys()] },
        status: { $in: [...LIVE, 'pending_payment'] },
        startDate: { $lt: newEnd },
        $or: [{ endDate: null }, { endDate: { $gt: newStart } }]
    }).populate('vendorId', 'restaurantName').lean();
    const out = [];
    for (const sub of subs) {
        if (sub.status === 'pending_payment' && Date.now() - new Date(sub.createdAt).getTime() > 60 * 60_000) continue; // abandoned checkout
        if (sub.cancelAt && new Date(sub.cancelAt) <= newStart) continue;
        const slots = [...slotKeysOf(sub)].filter((s) => newSlots.has(s));
        if (!slots.length) continue;
        if (!deliveryWeekdays(sub).some((d) => newDays.has(d))) continue;
        const emp = byUser.get(String(sub.userId));
        const lastDay = sub.cancelAt || sub.endDate;
        out.push({
            employeeId: String(emp._id),
            name: emp.name,
            slots,
            vendorName: sub.vendorId?.restaurantName || '',
            until: lastDay ? storageDateStr(addDays(lastDay, -1)) : null
        });
    }
    return out;
};

// ─── Quote ──────────────────────────────────────────────────────────────────

const toIds = (list) => [...new Set((Array.isArray(list) ? list : [list]).map(String).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
const normalizeSlots = (slots) => [...new Set((Array.isArray(slots) ? slots : [slots]).map((s) => String(s || '').trim().toLowerCase()).filter(Boolean))];

/**
 * What an office order costs, priced on the server. Throws OfficeAssignError for anything that cannot be sold
 * (company not approved, no delivery pin, employee without a sign-in number, vendor not delivering there, ...).
 * Returns { quote (one employee's subscription), employeeCount, lines and total for the whole order, conflicts, ... }.
 */
export const quoteOfficeOrder = async ({ accountId, employeeIds, vendorId, mealPlanId, subscriptionPlanId, slots, startDate }) => {
    const company = await OfficeCompany.findOne({ accountId }).lean();
    if (!company) throw new OfficeAssignError('Company not found', 404, 'COMPANY_NOT_FOUND');
    if (company.status !== 'approved') throw new OfficeAssignError('Your company account is not approved yet', 403, 'COMPANY_NOT_APPROVED');

    const ids = toIds(employeeIds);
    if (!ids.length) throw new OfficeAssignError('Select at least one employee', 400, 'NO_EMPLOYEES');
    if (!mongoose.Types.ObjectId.isValid(String(vendorId || ''))) throw new OfficeAssignError('Choose a vendor', 400, 'NO_VENDOR');
    if (!mongoose.Types.ObjectId.isValid(String(mealPlanId || ''))) throw new OfficeAssignError('Choose a meal', 400, 'NO_MEAL');
    if (!mongoose.Types.ObjectId.isValid(String(subscriptionPlanId || ''))) throw new OfficeAssignError('Choose a subscription plan', 400, 'NO_PLAN');
    const slotKeys = normalizeSlots(slots);
    if (!slotKeys.length) throw new OfficeAssignError('Choose at least one delivery slot', 400, 'NO_SLOT');

    const employees = await OfficeEmployee.find({ _id: { $in: ids }, accountId }).lean();
    if (employees.length !== ids.length) throw new OfficeAssignError('Some of the selected employees no longer exist. Reload the page and try again.', 404, 'EMPLOYEE_NOT_FOUND');
    const paused = employees.filter((e) => e.status !== 'Active');
    if (paused.length) throw new OfficeAssignError(`These employees are paused: ${paused.map((e) => e.name).join(', ')}. Activate them first.`, 400, 'EMPLOYEE_PAUSED');
    const noAccount = employees.filter((e) => !e.userId);
    if (noAccount.length) {
        throw new OfficeAssignError(`Add a mobile number for ${noAccount.map((e) => e.name).join(', ')} first: it is how they sign in to see their meals.`, 400, 'EMPLOYEE_NO_PHONE');
    }

    const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName mealSlots').lean();
    if (!vendor) throw new OfficeAssignError('This vendor is not available', 404, 'VENDOR_UNAVAILABLE');
    if (vendor.mealSlots?.length) {
        const notCooked = slotKeys.filter((k) => !vendor.mealSlots.includes(k));
        if (notCooked.length) throw new OfficeAssignError(`${vendor.restaurantName} does not cook for: ${notCooked.join(', ')}`, 400, 'SLOT_NOT_OFFERED');
    }

    const delivery = await resolveOfficeDelivery(company);
    let quote;
    try {
        quote = await quoteSubscription({
            subscriptionPlanId: String(subscriptionPlanId),
            vendorId: String(vendorId),
            zoneId: delivery.zoneId,
            startDate: startDate || undefined,
            meals: [{ mealPlanId: String(mealPlanId), quantity: 1 }],
            deliverySlots: slotKeys
        }, { userId: null });
    } catch (err) {
        if (err instanceof QuoteError) throw new OfficeAssignError(err.message, err.statusCode || 400, err.code, err.details);
        throw err;
    }

    const conflicts = await findSlotConflicts({ employees, quote });
    const count = employees.length;
    return {
        quote,
        currency: quote.currency,
        employeeCount: count,
        employees: employees.map((e) => ({ _id: String(e._id), name: e.name })),
        perEmployee: { ...quote.totals, deliveries: quote.orders },
        lines: quote.lines.map((l) => ({ ...l, amount: r2(l.amount * count) })),
        total: r2(quote.totals.total * count),
        startDate: quote.startDate,
        endDate: quote.endDate,
        lastDate: quote.lastDate,
        firstDeliveryDate: quote.firstDeliveryDate,
        lastDeliveryDate: quote.lastDeliveryDate,
        earliestStartDate: quote.earliestStartDate,
        deliveryDates: quote.deliveryDates,
        deliverySlots: quote.deliverySlots,
        planName: quote.planName,
        conflicts,
        delivery: { zoneId: delivery.zoneId, zoneName: delivery.zoneName, address: delivery.address }
    };
};

// ─── Fulfilment ─────────────────────────────────────────────────────────────

/** Subscription fields for a payment created before quotes were stored (the old browser-priced orders). */
const legacyFields = async (pay) => {
    const plan = pay.subscriptionPlanId ? await VendorSubscriptionPlan.findById(pay.subscriptionPlanId).lean() : null;
    const meal = await DMBMealPlan.findById(pay.mealPlanId).select('pricePerDay').lean();
    const cycle = cycleFromPlanDuration(plan?.duration || 'month');
    const deliverySlots = normalizeSlots(pay.slots);
    const draft = {
        startDate: pay.startDate && pay.startDate >= localToday() ? dateOnlyFromStr(storageDateStr(pay.startDate)) : localToday(),
        deliveryDays: plan?.deliveryDays === 'full_week' ? 'full_week' : 'mon_fri',
        deliverySlots,
        deliverySlot: deliverySlots[0],
        vendorId: pay.vendorId,
        meals: [{ mealPlanId: pay.mealPlanId, quantity: 1 }]
    };
    const period = buildPeriod(draft, { cycle, slotDefs: await listSlots() });
    const count = Math.max(1, pay.employeeIds?.length || 1);
    return {
        ...draft,
        startDate: period.startDate,
        endDate: period.endDate,
        nextDeliveryDate: period.dates[0]?.date || period.startDate,
        billingCycleStart: period.startDate,
        subscriptionPlanId: pay.subscriptionPlanId || null,
        billingCycle: cycle,
        duration: cycle,
        mealPlanId: pay.mealPlanId,
        pricing: { basePricePerDay: Number(meal?.pricePerDay) || 0, deliveryFeePerDay: 0, totalPrice: r2(pay.amount / count), currency: pay.currency }
    };
};

/** One readable list of slot names ("Breakfast, Lunch") for the employee's summary fields. */
const slotNames = async (keys) => {
    const defs = await listSlots();
    return keys.map((k) => getSlotLabel(defs, k)).join(', ');
};

/**
 * The denormalised "current plan" fields on the employee (shown by older screens): the newest live office
 * subscription, or cleared when there is none.
 */
export const refreshEmployeeSummary = async (employeeId) => {
    const employee = await OfficeEmployee.findById(employeeId).select('userId accountId').lean();
    if (!employee) return;
    const live = employee.userId
        ? await DMBSubscription.findOne({ userId: employee.userId, source: 'office', status: { $in: LIVE } }).sort({ createdAt: -1 }).lean()
        : null;
    if (live) {
        await OfficeEmployee.updateOne({ _id: employeeId }, {
            $set: {
                assignedVendorId: live.vendorId,
                assignedMealPlanId: live.mealPlanId || live.meals?.[0]?.mealPlanId || null,
                deliverySlot: await slotNames(live.deliverySlots?.length ? live.deliverySlots : [live.deliverySlot]),
                subscriptionStatus: live.status === 'paused' ? 'paused' : 'active'
            }
        });
    } else {
        await OfficeEmployee.updateOne({ _id: employeeId }, { $set: { assignedVendorId: null, assignedMealPlanId: null, deliverySlot: '', subscriptionStatus: 'none' } });
    }
};

const notifyVendorOfOfficeOrder = async ({ pay, company, created }) => {
    try {
        const [{ sendNotificationToUser }, { msg }, { queueEmail }] = await Promise.all([
            import('../../../core/notifications/notification.service.js'),
            import('../../i18n/i18n.service.js'),
            import('../../email/email.service.js')
        ]);
        const first = created[0];
        const vars = { company: company?.legalName || 'A company', count: created.length, date: storageDateStr(first.startDate) };
        await sendNotificationToUser({
            recipientId: pay.vendorId,
            recipientType: 'vendor',
            title: msg('New office order 🏢'),
            body: msg('{{company}} ordered meals for {{count}} employees, starting {{date}}.', vars),
            data: { screen: 'subscribers', event: 'office_order', officePaymentId: String(pay._id) }
        });
        const vendor = await FoodRestaurant.findById(pay.vendorId).select('ownerEmail').lean();
        if (vendor?.ownerEmail) {
            await queueEmail({
                to: vendor.ownerEmail,
                subjectKey: 'New office order 🏢',
                bodyKey: '{{company}} ordered meals for {{count}} employees, starting {{date}}. Open the vendor app to see the orders.',
                vars,
                ownerType: 'RESTAURANT',
                ownerId: pay.vendorId
            }).catch((err) => logger.warn(`Office-order email for vendor ${pay.vendorId} not sent: ${err?.message || err}`));
        }
    } catch (err) {
        logger.warn(`Office-order notification for payment ${pay._id} failed: ${err?.message || err}`);
    }
};

const assignmentsOfPayment = (pay) => OfficeMealAssignment.find({ accountId: pay.accountId, employeeId: { $in: pay.employeeIds }, ...(pay.quote ? { officePaymentId: pay._id } : {}) });

/**
 * Delivers a paid office order: one subscription (and assignment) per employee, built from the quote that was paid,
 * then today's/tomorrow's orders so the vendor sees them at once. Safe to call again or concurrently: each employee is
 * done once (unique per payment + employee), and a second call returns what exists.
 * Returns { payment, assignments, attention } — attention lists employees who could not be served (paid for, so an
 * admin must refund or fix them).
 */
export const fulfilOfficePayment = async (officePaymentId, meta = {}) => {
    const existing = await OfficePayment.findById(officePaymentId);
    if (!existing) throw new OfficeAssignError('Office payment not found', 404);
    if (existing.fulfilledAt) return { payment: existing, assignments: await assignmentsOfPayment(existing) };
    if (!existing.mealPlanId || !existing.vendorId) throw new OfficeAssignError('Office payment is missing the meal plan or vendor');

    const pay = await OfficePayment.findOneAndUpdate(
        { _id: existing._id, fulfilledAt: null, $or: [{ fulfillingAt: null }, { fulfillingAt: { $lt: new Date(Date.now() - FULFIL_CLAIM_MS) } }] },
        { $set: { fulfillingAt: new Date() } },
        { new: true }
    );
    if (!pay) throw new OfficeAssignError('This order is already being processed. Refresh in a moment.', 409, 'IN_PROGRESS');

    try {
        const company = await OfficeCompany.findById(pay.companyId).lean() || await OfficeCompany.findOne({ accountId: pay.accountId }).lean();
        const fields = pay.quote ? subscriptionFieldsFromQuote(pay.quote) : await legacyFields(pay);
        const address = pay.deliveryAddress || companyDeliveryAddress(company, pay.zoneId);
        const zoneId = pay.zoneId || address?.zoneId || null;
        const paymentMethod = PAYMENT_METHODS.includes(pay.provider) ? pay.provider : 'cash';
        const slotLabel = await slotNames(fields.deliverySlots || [fields.deliverySlot]);
        const { generateForSubscription } = await import('../subscription/orderGeneration.js');

        const created = [];
        const skipped = [];
        for (const empId of pay.employeeIds || []) {
            const employee = await OfficeEmployee.findOne({ _id: empId, accountId: pay.accountId }).lean();
            if (!employee) {
                skipped.push({ employeeId: empId, name: '', reason: 'Employee was removed before the payment was confirmed' });
                continue;
            }
            const user = employee.userId ? await FoodUser.findById(employee.userId).select('_id').lean() : null;
            if (!user) {
                skipped.push({ employeeId: empId, name: employee.name, reason: 'Employee has no customer account (mobile number)' });
                continue;
            }

            let sub = await DMBSubscription.findOne({ officePaymentId: pay._id, officeEmployeeId: employee._id });
            if (!sub) {
                try {
                    sub = await DMBSubscription.create({
                        userId: user._id,
                        zoneId,
                        ...fields,
                        deliveryAddress: address,
                        paymentMethod,
                        status: 'active',
                        source: 'office',
                        companyId: company?._id || pay.companyId || null,
                        companyName: company?.legalName || '',
                        companyNip: company?.nip || '',
                        billingEmail: company?.contactEmail || '',
                        invoiceType: 'b2b_vat',
                        autoRenew: false,
                        officePaymentId: pay._id,
                        officeEmployeeId: employee._id
                    });
                    created.push(sub);
                } catch (err) {
                    if (err?.code !== 11000) throw err;
                    sub = await DMBSubscription.findOne({ officePaymentId: pay._id, officeEmployeeId: employee._id });
                }
            }

            try {
                await OfficeMealAssignment.updateOne(
                    { officePaymentId: pay._id, employeeId: employee._id },
                    {
                        $setOnInsert: {
                            accountId: pay.accountId,
                            companyId: company?._id || null,
                            vendorId: pay.vendorId,
                            mealPlanId: pay.mealPlanId,
                            subscriptionPlanId: pay.subscriptionPlanId || null,
                            subscriptionId: sub._id,
                            mealSlots: sub.deliverySlots?.length ? sub.deliverySlots : [sub.deliverySlot],
                            status: 'active',
                            startDate: sub.startDate,
                            validUntil: sub.endDate ? addDays(sub.endDate, -1) : null,
                            assignedAt: new Date()
                        }
                    },
                    { upsert: true }
                );
            } catch (err) {
                if (err?.code !== 11000) throw err;
            }

            // The vendor (and dispatch) see today's/tomorrow's orders right away instead of after the hourly job.
            try {
                await generateForSubscription(sub.toObject ? sub.toObject() : sub);
            } catch (err) {
                logger.warn(`Immediate order generation failed for office subscription ${sub.subscriptionId} (the hourly job will retry): ${err.message}`);
            }
            await FoodUser.updateOne({ _id: user._id }, { $set: { subscriptionStatus: 'active' } });
            await OfficeEmployee.updateOne({ _id: employee._id }, {
                $set: { assignedVendorId: pay.vendorId, assignedMealPlanId: pay.mealPlanId, deliverySlot: slotLabel, subscriptionStatus: 'active' }
            });
        }

        pay.status = 'paid';
        pay.fulfilledAt = new Date();
        pay.fulfillingAt = null;
        if (skipped.length) pay.skippedEmployees = skipped;
        if (meta.paymentTxId) pay.paymentTransactionId = meta.paymentTxId;
        if (meta.providerPaymentId) pay.razorpayPaymentId = meta.providerPaymentId;
        await pay.save();

        // Not awaited: the payment confirmation (and the office's browser) must not wait for push/email delivery.
        if (created.length) void notifyVendorOfOfficeOrder({ pay, company, created });
        const attention = skipped.length
            ? `Office order ${pay._id}: ${skipped.length} employee(s) could not be given their meals (${skipped.map((s) => s.name || String(s.employeeId)).join(', ')}) — refund or reassign them.`
            : undefined;
        return { payment: pay, assignments: await assignmentsOfPayment(pay), attention };
    } catch (err) {
        await OfficePayment.updateOne({ _id: pay._id, fulfilledAt: null }, { $set: { fulfillingAt: null } }).catch(() => {});
        throw err;
    }
};

// ─── Cancelling ─────────────────────────────────────────────────────────────

/**
 * Stops a company-paid subscription: no new orders are made, and the deliveries from tomorrow on that the kitchen has
 * not started are removed (today's meal is already being cooked, so it is still delivered). Paid days are not refunded.
 */
export const cancelOfficeSubscription = async (sub, { reason = 'Cancelled by the company' } = {}) => {
    if (!sub || !LIVE.includes(sub.status)) return { removedOrders: 0 };
    await DMBSubscription.updateOne(
        { _id: sub._id },
        { $set: { status: 'cancelled', cancelledAt: new Date(), cancellationReason: reason, autoRenew: false, pausedUntil: null } }
    );
    const tomorrow = addDays(localToday(), 1);
    const removed = await DMBDailyOrder.find({ subscriptionId: sub._id, deliveryDate: { $gte: tomorrow }, status: 'scheduled' })
        .select('_id orderId vendorId deliveryDate deliverySlot').lean();
    if (removed.length) await DMBDailyOrder.deleteMany({ _id: { $in: removed.map((o) => o._id) } });

    const stillLive = await DMBSubscription.exists({ userId: sub.userId, status: { $in: LIVE } });
    if (!stillLive) await FoodUser.updateOne({ _id: sub.userId }, { $set: { subscriptionStatus: 'cancelled' } });

    try {
        const { getIO } = await import('../../../config/socket.js');
        const io = getIO();
        for (const o of removed) {
            io?.to(`vendor_${o.vendorId}`).emit('order_status_update', { orderId: o.orderId, _id: o._id, status: 'removed', deliveryDate: o.deliveryDate, deliverySlot: o.deliverySlot, updatedAt: new Date().toISOString() });
        }
        io?.to(`sub_${sub._id}`).emit('subscription_cancelled', { subscriptionId: sub.subscriptionId, status: 'cancelled' });
    } catch (err) {
        logger.warn(`Office cancellation sockets for ${sub.subscriptionId} failed: ${err.message}`);
    }
    return { removedOrders: removed.length };
};

// ─── Reading assignments ────────────────────────────────────────────────────

/** Where an assignment stands today: upcoming | active | paused | ended | cancelled. */
export const assignmentState = (assignment, sub, today = localToday()) => {
    if (assignment.status === 'cancelled' || sub?.status === 'cancelled') return 'cancelled';
    if (!sub) return assignment.status === 'active' ? 'active' : 'ended';
    if (sub.status === 'expired' || (sub.endDate && new Date(sub.endDate) <= today)) return 'ended';
    if (sub.status === 'paused') return 'paused';
    if (sub.startDate && new Date(sub.startDate) > today) return 'upcoming';
    return sub.status === 'active' ? 'active' : 'ended';
};

/** The current (upcoming, active or paused) plans of each employee: Map employeeId → [{ vendorName, slots, from, until, state }]. */
export const currentPlansByEmployee = async (accountId, employeeIds) => {
    const rows = await OfficeMealAssignment.find({ accountId, employeeId: { $in: employeeIds }, status: { $ne: 'cancelled' } })
        .populate('vendorId', 'restaurantName')
        .populate('mealPlanId', 'name')
        .populate('subscriptionId', 'status startDate endDate deliverySlots deliverySlot')
        .lean();
    const today = localToday();
    const out = new Map();
    for (const a of rows) {
        const state = assignmentState(a, a.subscriptionId, today);
        if (!['upcoming', 'active', 'paused'].includes(state)) continue;
        const sub = a.subscriptionId;
        const list = out.get(String(a.employeeId)) || [];
        list.push({
            assignmentId: String(a._id),
            vendorId: String(a.vendorId?._id || a.vendorId || ''),
            vendorName: a.vendorId?.restaurantName || '',
            mealName: a.mealPlanId?.name || '',
            slots: sub?.deliverySlots?.length ? sub.deliverySlots : (a.mealSlots || []),
            from: sub?.startDate ? storageDateStr(sub.startDate) : null,
            until: sub?.endDate ? storageDateStr(addDays(sub.endDate, -1)) : null,
            state
        });
        out.set(String(a.employeeId), list);
    }
    return out;
};
