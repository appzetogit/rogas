import { OfficeEmployee } from '../models/officeEmployee.model.js';
import { OfficeMealAssignment } from '../models/officeMealAssignment.model.js';
import { OfficeCompany } from '../models/officeCompany.model.js';
import { OfficeAccount } from '../models/officeAccount.model.js';
import { OfficeOnboarding } from '../models/officeOnboarding.model.js';
import { OfficePayment } from '../models/officePayment.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../../food/restaurant/models/restaurant.model.js';
import { DMBMealPlan } from '../../mealplan/mealPlan.model.js';
import { DMBSubscription } from '../../subscription/subscription.model.js';
import { DMBDailyOrder } from '../../subscription/dmb.dailyOrder.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, fulfil, PaymentsError } from '../../../payments/payments.service.js';
import { resolvePaymentContext } from '../../../payments/payments.settings.js';
import { PaymentTransaction } from '../../../payments/payments.models.js';
import {
    quoteOfficeOrder, cancelOfficeSubscription, refreshEmployeeSummary, assignmentState, currentPlansByEmployee,
    companyDeliveryAddress, OfficeAssignError
} from '../office.assignment.service.js';
import { normalizeEmployeePhone, findUserByEmployeePhone, EmployeePhoneError } from '../employeePhone.js';
import { dialCodeFromPhone } from '../../../../core/auth/auth.service.js';
import { vendorServesZone } from '../../subscription/pricing.service.js';
import { detectZone, vendorHasValidLocation } from '../../zones/zoneGeo.service.js';
import { lookupNip, NipLookupError } from '../nipLookup.service.js';
import { notifyAdminsSafely } from '../../../../core/notifications/firebase.service.js';
import { sendOfficeNotificationEmail } from '../../../../utils/email.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { addDays, localToday, storageDateStr } from '../../../../utils/platformTime.js';
import { logger } from '../../../../utils/logger.js';

const PAID_LIKE = ['paid', 'partially_refunded', 'refunded'];
const LIVE = ['active', 'paused'];
const MAX_EMPLOYEES = 1000;
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A stored number in its canonical form; numbers saved before normalisation that cannot be parsed stay as they are. */
const storedPhone = (phone) => {
    try {
        return normalizeEmployeePhone(phone);
    } catch {
        return phone || '';
    }
};

/** Sends any error a handler throws: our own (with a status) as they are, anything unexpected as a 500. */
const fail = (res, error) => {
    if (error instanceof OfficeAssignError) {
        return res.status(error.statusCode || 400).json({ success: false, code: error.code, message: error.message, details: error.details });
    }
    if (error instanceof EmployeePhoneError || error instanceof PaymentsError) return sendError(res, error.statusCode || 400, error.message);
    logger.error(`Office API error: ${error?.message || error}`);
    return sendError(res, 500, error?.message || 'Something went wrong');
};

// ─── Employee Controllers ─────────────────────────────────────────────────────

/** The only employee fields an office can set; everything else (account, linked user, plan fields) is server-owned. */
const EMPLOYEE_FIELDS = ['name', 'email', 'phone', 'department', 'status', 'profileImage'];
const pickEmployeeFields = (body = {}) => {
    const out = {};
    for (const key of EMPLOYEE_FIELDS) {
        if (body[key] !== undefined) out[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    }
    if (out.status !== undefined && !['Active', 'Paused'].includes(out.status)) throw new OfficeAssignError('Status must be Active or Paused');
    if (out.email !== undefined) out.email = String(out.email).toLowerCase();
    return out;
};

const companyFieldsForUser = (company) => ({
    companyId: company._id,
    companyNip: company.nip || '',
    companyName: company.legalName || '',
    registeredAddress: company.registeredAddress || '',
    deliveryAddress: company.deliveryAddress || '',
    billingEmail: company.contactEmail || ''
});

/**
 * The customer account an employee signs in with, found by their (normalised) mobile number or created. Refuses a
 * number that already belongs to another company's employee or to another employee of this company.
 */
const linkEmployeeUser = async ({ company, accountId, phone, name, email, exceptEmployeeId = null }) => {
    let user = await findUserByEmployeePhone(FoodUser, phone);
    if (user) {
        if (user.isDeleted) throw new OfficeAssignError('This mobile number cannot be used. Please use another number.', 409, 'PHONE_UNAVAILABLE');
        if (user.companyId && String(user.companyId) !== String(company._id)) {
            throw new OfficeAssignError('This mobile number belongs to an employee of another company.', 409, 'PHONE_OTHER_COMPANY');
        }
        const taken = await OfficeEmployee.exists({ accountId, userId: user._id, ...(exceptEmployeeId ? { _id: { $ne: exceptEmployeeId } } : {}) });
        if (taken) throw new OfficeAssignError('Another employee already uses this mobile number.', 409, 'PHONE_TAKEN');
        if (!user.name && name) user.name = name;
        if (!user.email && email) user.email = email;
        user.role = 'EMPLOYEE';
        Object.assign(user, companyFieldsForUser(company));
        // Older accounts stored the number without "+48": store it the way the app signs in, so login finds this account.
        if (user.phone !== phone && !(await FoodUser.exists({ phone }))) {
            user.phone = phone;
            user.countryCode = dialCodeFromPhone(phone) || user.countryCode;
        }
        await user.save();
        return user;
    }
    return FoodUser.create({
        phone,
        countryCode: dialCodeFromPhone(phone) || '+48',
        name: name || '',
        email: email || '',
        role: 'EMPLOYEE',
        ...companyFieldsForUser(company),
        isVerified: true,
        isActive: true,
        subscriptionStatus: 'none'
    });
};

/** The account no longer belongs to the company (employee removed, or their number changed). */
const unlinkEmployeeUser = async (userId, company) => {
    if (!userId || !company) return;
    await FoodUser.updateOne(
        { _id: userId, companyId: company._id },
        { $set: { role: 'USER', companyId: null, companyNip: '', companyName: '', registeredAddress: '', deliveryAddress: '', billingEmail: '' } }
    );
};

export const getEmployees = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { search, department, status, page = 1, limit = 10 } = req.query;
        const sort = ['-createdAt', 'createdAt', 'name', '-name'].includes(req.query.sort) ? req.query.sort : '-createdAt';

        const query = { accountId };
        if (search) {
            const re = { $regex: escapeRegex(search), $options: 'i' };
            query.$or = [{ name: re }, { email: re }];
        }
        if (department) query.department = department;
        if (status) query.status = status;

        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const limitNum = Math.min(1000, Math.max(1, parseInt(limit, 10) || 10));
        const [employees, total] = await Promise.all([
            OfficeEmployee.find(query).sort(sort).skip((pageNum - 1) * limitNum).limit(limitNum).select('-tempPassword').lean(),
            OfficeEmployee.countDocuments(query)
        ]);

        // Every employee's current meal plans (an employee can have several at once).
        const plans = await currentPlansByEmployee(accountId, employees.map((e) => e._id));
        for (const e of employees) {
            e.plans = plans.get(String(e._id)) || [];
            e.hasAccount = Boolean(e.userId);
        }

        return sendResponse(res, 200, 'Employees retrieved successfully', {
            employees,
            pagination: { total, page: pageNum, limit: limitNum, pages: Math.ceil(total / limitNum) }
        });
    } catch (error) {
        return fail(res, error);
    }
};

export const addEmployee = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const data = pickEmployeeFields(req.body);
        if (!data.name) throw new OfficeAssignError('Enter the employee\'s name');
        if (!data.email) throw new OfficeAssignError('Enter the employee\'s work email');
        const phone = normalizeEmployeePhone(data.phone);

        const company = await OfficeCompany.findOne({ accountId });
        if (!company || company.status !== 'approved') return sendError(res, 403, 'Company not approved for operations');
        if ((await OfficeEmployee.countDocuments({ accountId })) >= MAX_EMPLOYEES) return sendError(res, 400, 'Employee limit reached');
        if (await OfficeEmployee.exists({ accountId, email: data.email })) {
            throw new OfficeAssignError('An employee with this email already exists.', 409, 'EMAIL_TAKEN');
        }

        const user = await linkEmployeeUser({ company, accountId, phone, name: data.name, email: data.email });
        let employee;
        try {
            employee = await OfficeEmployee.create({
                ...data,
                phone,
                accountId,
                companyId: company._id,
                companyNip: company.nip || '',
                companyName: company.legalName || '',
                registeredAddress: company.registeredAddress || '',
                deliveryAddress: company.deliveryAddress || '',
                billingEmail: company.contactEmail || '',
                userId: user._id
            });
        } catch (err) {
            if (err?.code === 11000) throw new OfficeAssignError('An employee with this email already exists.', 409, 'EMAIL_TAKEN');
            throw err;
        }
        await OfficeCompany.updateOne({ _id: company._id }, { $inc: { totalEmployees: 1 } });

        return sendResponse(res, 201, 'Employee added successfully', employee);
    } catch (error) {
        return fail(res, error);
    }
};

export const updateEmployee = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const updates = pickEmployeeFields(req.body);
        const employee = await OfficeEmployee.findOne({ _id: req.params.id, accountId });
        if (!employee) return sendError(res, 404, 'Employee not found');
        const company = await OfficeCompany.findOne({ accountId });

        if (updates.email && updates.email !== employee.email && await OfficeEmployee.exists({ accountId, email: updates.email, _id: { $ne: employee._id } })) {
            throw new OfficeAssignError('An employee with this email already exists.', 409, 'EMAIL_TAKEN');
        }

        if (updates.phone !== undefined) {
            const phone = normalizeEmployeePhone(updates.phone);
            if (phone !== storedPhone(employee.phone) || !employee.userId) {
                // A new number is a different sign-in: link that account (never rewrite someone's login number) and move
                // the employee's company-paid meals over to it.
                const user = await linkEmployeeUser({ company, accountId, phone, name: updates.name || employee.name, email: updates.email || employee.email, exceptEmployeeId: employee._id });
                const oldUserId = employee.userId;
                if (oldUserId && String(oldUserId) !== String(user._id)) {
                    const subs = await DMBSubscription.find({ userId: oldUserId, source: 'office', companyId: company._id, status: { $in: LIVE } }).select('_id').lean();
                    if (subs.length) {
                        const subIds = subs.map((s) => s._id);
                        await DMBSubscription.updateMany({ _id: { $in: subIds } }, { $set: { userId: user._id } });
                        await DMBDailyOrder.updateMany(
                            { subscriptionId: { $in: subIds }, deliveryDate: { $gte: localToday() }, status: { $in: ['scheduled', 'preparing', 'ready'] } },
                            { $set: { userId: user._id } }
                        );
                        await FoodUser.updateOne({ _id: user._id }, { $set: { subscriptionStatus: 'active' } });
                    }
                    await unlinkEmployeeUser(oldUserId, company);
                }
                employee.userId = user._id;
            }
            updates.phone = phone;
        }

        Object.assign(employee, updates);
        if (company) {
            employee.companyNip = company.nip || '';
            employee.companyName = company.legalName || '';
            employee.registeredAddress = company.registeredAddress || '';
            employee.deliveryAddress = company.deliveryAddress || '';
            employee.billingEmail = company.contactEmail || '';
        }
        try {
            await employee.save();
        } catch (err) {
            if (err?.code === 11000) throw new OfficeAssignError('An employee with this email already exists.', 409, 'EMAIL_TAKEN');
            throw err;
        }

        // Keep the name and email on the employee's account in step (never the sign-in number: see above).
        if (employee.userId && company) {
            const userUpdates = { ...companyFieldsForUser(company) };
            if (updates.name !== undefined) userUpdates.name = updates.name;
            if (updates.email !== undefined) userUpdates.email = updates.email;
            await FoodUser.updateOne({ _id: employee.userId, companyId: company._id }, { $set: userUpdates });
        }

        return sendResponse(res, 200, 'Employee updated successfully', employee);
    } catch (error) {
        return fail(res, error);
    }
};

export const deleteEmployee = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const employee = await OfficeEmployee.findOne({ _id: req.params.id, accountId });
        if (!employee) return sendError(res, 404, 'Employee not found');
        const company = await OfficeCompany.findOne({ accountId });

        // Their company-paid meals stop too (the UI promises "will cancel all active meal plans").
        const assignments = await OfficeMealAssignment.find({ employeeId: employee._id, accountId }).select('subscriptionId').lean();
        const subs = await DMBSubscription.find({
            source: 'office',
            status: { $in: LIVE },
            $or: [{ officeEmployeeId: employee._id }, { _id: { $in: assignments.map((a) => a.subscriptionId).filter(Boolean) } }]
        });
        let removedOrders = 0;
        for (const sub of subs) removedOrders += (await cancelOfficeSubscription(sub, { reason: 'Employee removed by the company' })).removedOrders;

        await OfficeMealAssignment.deleteMany({ employeeId: employee._id, accountId });
        await unlinkEmployeeUser(employee.userId, company);
        await employee.deleteOne();
        await OfficeCompany.updateOne({ accountId, totalEmployees: { $gt: 0 } }, { $inc: { totalEmployees: -1 } });

        return sendResponse(res, 200, 'Employee deleted successfully', { cancelledSubscriptions: subs.length, removedOrders });
    } catch (error) {
        return fail(res, error);
    }
};

// --- Vendor & Meal Assignment ---

/**
 * Vendors the office can order from: approved, with a valid kitchen pin, and delivering to the office's zone (when the
 * office has set its map pin). Each comes with its active meals.
 */
export const getVendors = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const company = await OfficeCompany.findOne({ accountId }).lean();

        let delivery = { status: 'missing', zoneId: null, zoneName: '' };
        const lat = Number(company?.location?.lat);
        const lng = Number(company?.location?.lng);
        if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
            const zone = await detectZone(lat, lng);
            delivery = zone ? { status: 'ok', zoneId: String(zone._id), zoneName: zone.name || zone.zoneName || '' } : { status: 'outside', zoneId: null, zoneName: '' };
        }

        let vendors = await FoodRestaurant.find({ status: 'approved' })
            .select('restaurantName vendorType cuisines rating totalRatings profileImage coverImages location mealSlots zoneId deliveryZoneIds description cookTrack track1Paused')
            .lean();
        if (delivery.zoneId) vendors = vendors.filter((v) => vendorServesZone(v, delivery.zoneId));
        const usable = [];
        for (const v of vendors) if (await vendorHasValidLocation(v)) usable.push(v);
        const { blockedCookIds } = await import('../../legal/legal.service.js');
        const blocked = await blockedCookIds(usable);
        vendors = usable.filter((v) => !blocked.has(String(v._id)));

        const meals = await DMBMealPlan.find({ vendorId: { $in: vendors.map((v) => v._id) }, status: 'active' })
            .select('vendorId name description pricePerDay currency photos nutrition allergens dietTags availableSlots temperatureType')
            .sort({ createdAt: -1 })
            .lean();
        const byVendor = new Map();
        for (const m of meals) {
            const key = String(m.vendorId);
            if (!byVendor.has(key)) byVendor.set(key, []);
            byVendor.get(key).push(m);
        }
        for (const v of vendors) {
            v.mealPlans = byVendor.get(String(v._id)) || [];
            delete v.cookTrack;
            delete v.track1Paused;
        }

        return sendResponse(res, 200, 'Vendors retrieved successfully', { vendors, delivery });
    } catch (error) {
        return fail(res, error);
    }
};

/** POST /office/assignments/quote — the price of an order before paying, plus employees who already have that slot. */
export const quoteAssignmentOrder = async (req, res) => {
    try {
        const { employeeIds, vendorId, mealPlanId, subscriptionPlanId, slots, startDate } = req.body || {};
        const q = await quoteOfficeOrder({ accountId: req.user.accountId, employeeIds, vendorId, mealPlanId, subscriptionPlanId, slots, startDate });
        return sendResponse(res, 200, 'Quote ready', { ...q, quote: undefined });
    } catch (error) {
        return fail(res, error);
    }
};

/**
 * POST /office/assignments/create-order — starts the payment for an order. The amount is the server quote; the browser's
 * `expectedTotal` (what it showed) must match it, so nobody pays a price they did not see.
 */
export const createAssignmentOrder = async (req, res) => {
    let pending = null;
    try {
        const accountId = req.user.accountId;
        const { employeeIds, subscriptionPlanId, vendorId, slots, mealPlanId, startDate, provider, returnPath, cancelPath, language } = req.body || {};
        const q = await quoteOfficeOrder({ accountId, employeeIds, vendorId, mealPlanId, subscriptionPlanId, slots, startDate });
        if (q.conflicts.length) {
            throw new OfficeAssignError(
                `Already have a meal in this slot during this period: ${q.conflicts.map((c) => `${c.name}${c.until ? ` (until ${c.until})` : ''}`).join(', ')}. Remove them or pick a later start date.`,
                409, 'SLOT_TAKEN', { conflicts: q.conflicts }
            );
        }
        const expected = req.body?.expectedTotal ?? req.body?.totalAmount;
        if (expected === undefined || expected === null || Math.abs(Number(expected) - q.total) > 0.01) {
            throw new OfficeAssignError('The price has changed. Please review the new total and confirm again.', 409, 'PRICE_CHANGED', { total: q.total, currency: q.currency });
        }

        const company = await OfficeCompany.findOne({ accountId }).lean();
        const ctx = await resolvePaymentContext({ zoneId: q.delivery.zoneId });
        const n = q.employeeCount;
        pending = await OfficePayment.create({
            accountId,
            companyId: company?._id,
            razorpayOrderId: `pending_${accountId}_${Date.now()}`,
            subscriptionPlanId,
            vendorId,
            mealPlanId,
            startDate: new Date(q.startDate),
            endDate: new Date(q.endDate),
            planType: q.quote.cycle,
            quote: q.quote,
            zoneId: q.delivery.zoneId,
            deliveryAddress: q.delivery.address,
            employeeIds: q.employees.map((e) => e._id),
            slots: q.deliverySlots,
            amount: q.total,
            currency: q.currency,
            status: 'pending',
            breakdown: {
                foodTotal: Math.round(q.quote.totals.food * n * 100) / 100,
                foodVat: Math.round(q.quote.totals.foodVat * n * 100) / 100,
                delivery: Math.round(q.quote.totals.delivery * n * 100) / 100,
                deliveryVat: Math.round(q.quote.totals.deliveryVat * n * 100) / 100,
                platformFee: Math.round(q.quote.totals.platformFee * n * 100) / 100,
                discount: Math.round(q.quote.totals.discount * n * 100) / 100
            }
        });

        const { payment } = await startPayment({
            purpose: 'office',
            ownerType: 'office',
            ownerId: accountId,
            amount: q.total,
            currency: q.currency,
            country: ctx.country,
            provider,
            description: `Office meal subscription (${n} ${n === 1 ? 'employee' : 'employees'})`,
            customer: { name: company?.legalName, email: company?.contactEmail, phone: company?.contactPhone },
            language,
            returnPath: returnPath || '/office/AssignedMealPlans',
            cancelPath: cancelPath || '/office/VendorsAssign',
            refs: { officePaymentId: String(pending._id) }
        });

        pending.razorpayOrderId = payment.provider === 'razorpay' ? payment.action.orderId : payment.transactionId;
        pending.paymentTransactionId = payment.transactionId;
        pending.provider = payment.provider;
        pending.isMock = payment.provider === 'mock';
        await pending.save();

        const data = { payment, officePaymentId: String(pending._id), orderId: pending.razorpayOrderId, amount: payment.amountMinor, currency: payment.currency, isMock: payment.provider === 'mock' };
        if (payment.provider === 'razorpay') data.razorpayKeyId = payment.action.key;
        return sendResponse(res, 200, 'Order created successfully', data);
    } catch (error) {
        if (pending) await OfficePayment.deleteOne({ _id: pending._id, status: 'pending' }).catch(() => {});
        return fail(res, error);
    }
};

/**
 * POST /office/assignments — older clients call this after the Razorpay pop-up. It only confirms the payment; the meals
 * are assigned by the payment's own exactly-once fulfilment (the same one webhooks use), never directly from here.
 */
export const assignMealPlan = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { transactionId, razorpayOrderId } = req.body || {};
        if (!(transactionId || razorpayOrderId)) return sendError(res, 402, 'Payment is required to assign a meal plan');
        const office = await OfficePayment.findOne(
            transactionId
                ? { accountId, paymentTransactionId: String(transactionId) }
                : { accountId, razorpayOrderId: String(razorpayOrderId) }
        );
        if (!office) return sendError(res, 402, 'Payment is required to assign a meal plan');

        const tx = await findOwnedTransaction({ publicId: office.paymentTransactionId, purpose: 'office', ownerId: accountId });
        if (!tx) return sendError(res, 404, 'Payment not found');
        if (tx.provider === 'razorpay' && req.body.razorpayPaymentId && !PAID_LIKE.includes(tx.status)) {
            await confirmRazorpayPayment(tx, { ...req.body, razorpayOrderId: tx.providerOrderId });
        }
        const fresh = await PaymentTransaction.findById(tx._id);
        if (!PAID_LIKE.includes(fresh.status)) return sendError(res, 402, 'Payment has not been completed yet');
        if (!fresh.fulfilment?.done) await fulfil(fresh);

        const done = await OfficePayment.findById(office._id);
        if (!done?.fulfilledAt) {
            return res.status(202).json({ success: true, message: 'Your payment is confirmed. The meals are being assigned, refresh in a moment.', data: [] });
        }
        const assignments = await OfficeMealAssignment.find({ accountId, officePaymentId: done._id });
        return sendResponse(res, 200, 'Meal plan assigned successfully', assignments);
    } catch (error) {
        return fail(res, error);
    }
};

/** GET /office/assignments — every meal subscription the office bought, newest first, with where each stands today. */
export const getAssignments = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const rows = await OfficeMealAssignment.find({ accountId })
            .populate('employeeId', 'name email department employeeId phone status')
            .populate('vendorId', 'restaurantName profileImage')
            .populate('mealPlanId', 'name pricePerDay photos')
            .populate('subscriptionId', 'subscriptionId status startDate endDate cancelAt deliverySlots deliverySlot deliveryDays pausedUntil pricing')
            .sort('-createdAt')
            .lean();
        const today = localToday();
        const assignments = rows
            .filter((a) => a.employeeId)
            .map((a) => {
                const sub = a.subscriptionId;
                return {
                    ...a,
                    state: assignmentState(a, sub, today),
                    slots: sub?.deliverySlots?.length ? sub.deliverySlots : (a.mealSlots || []),
                    from: sub?.startDate ? storageDateStr(sub.startDate) : (a.startDate ? storageDateStr(a.startDate) : null),
                    until: sub?.endDate ? storageDateStr(addDays(sub.endDate, -1)) : null
                };
            });
        return sendResponse(res, 200, 'Assignments retrieved successfully', assignments);
    } catch (error) {
        return fail(res, error);
    }
};

/**
 * DELETE /office/assignments/:id — stops one employee's company-paid subscription (deliveries from tomorrow that are
 * not being cooked are removed; paid days are not refunded). The row stays, marked cancelled, as a record.
 */
export const deleteAssignment = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const assignment = await OfficeMealAssignment.findOne({ _id: req.params.id, accountId });
        if (!assignment) return sendError(res, 404, 'Assignment not found');
        if (assignment.status === 'cancelled') return sendResponse(res, 200, 'Assignment already cancelled', assignment);

        const sub = assignment.subscriptionId ? await DMBSubscription.findOne({ _id: assignment.subscriptionId, source: 'office' }) : null;
        const { removedOrders } = await cancelOfficeSubscription(sub, { reason: 'Cancelled by the company' });
        assignment.status = 'cancelled';
        assignment.cancelledAt = new Date();
        assignment.cancelReason = 'Cancelled by the company';
        await assignment.save();
        await refreshEmployeeSummary(assignment.employeeId);

        return sendResponse(res, 200, 'Assignment cancelled', { assignment, removedOrders });
    } catch (error) {
        return fail(res, error);
    }
};

// ─── Payment Controllers ──────────────────────────────────────────────

export const getPayments = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const payments = await OfficePayment.find({ accountId })
            .select('-quote')
            .populate('vendorId', 'restaurantName profileImage')
            .populate('subscriptionPlanId', 'name duration deliveryDays')
            .populate('mealPlanId', 'name')
            .populate('employeeIds', 'name email department')
            .sort('-createdAt');

        return sendResponse(res, 200, 'Payments retrieved successfully', payments);
    } catch (error) {
        return fail(res, error);
    }
};

// ─── Company & Onboarding Controllers ────────────────────────────────────────

export const getCompanyDetails = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const company = await OfficeCompany.findOne({ accountId }).lean();
        if (!company) {
            return sendError(res, 404, 'Company details not found');
        }

        // Calculate budget utilized this month
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);

        const endOfMonth = new Date();
        endOfMonth.setMonth(endOfMonth.getMonth() + 1);
        endOfMonth.setDate(0);
        endOfMonth.setHours(23, 59, 59, 999);

        const paymentsThisMonth = await OfficePayment.find({
            accountId,
            status: 'paid',
            createdAt: { $gte: startOfMonth, $lte: endOfMonth }
        });

        const totalUtilized = paymentsThisMonth.reduce((sum, p) => sum + (p.amount || 0), 0);
        company.budgetUtilized = totalUtilized;

        // Vendors currently delivering to the company (an ended or cancelled plan does not count).
        const liveSubs = await DMBSubscription.find({ source: 'office', companyId: company._id, status: { $in: LIVE } }).distinct('vendorId');
        company.activeVendorsCount = liveSubs.length;
        company.totalEmployees = await OfficeEmployee.countDocuments({ accountId });

        return sendResponse(res, 200, 'Company details retrieved successfully', company);
    } catch (error) {
        return fail(res, error);
    }
};

/** The company fields the office may edit itself. Status, approval and account links are set only by the platform. */
const COMPANY_FIELDS = ['legalName', 'nip', 'regon', 'registeredAddress', 'deliveryAddress', 'monthlyBudgetCap', 'contactName', 'contactRole', 'contactEmail', 'contactPhone', 'location', 'profileImage'];

export const updateCompanyDetails = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const company = await OfficeCompany.findOne({ accountId });
        if (!company) return sendError(res, 404, 'Company details not found');

        const body = req.body || {};
        const updates = {};
        for (const key of COMPANY_FIELDS) if (body[key] !== undefined) updates[key] = body[key];
        if (updates.location !== undefined) {
            const lat = Number(updates.location?.lat);
            const lng = Number(updates.location?.lng);
            if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
                return sendError(res, 400, 'Invalid delivery location');
            }
            updates.location = { lat, lng };
        }
        if (updates.monthlyBudgetCap !== undefined) {
            const cap = Number(updates.monthlyBudgetCap);
            if (!Number.isFinite(cap) || cap < 0) return sendError(res, 400, 'Invalid monthly budget');
            updates.monthlyBudgetCap = cap;
        }
        const addressChanged = (updates.deliveryAddress !== undefined && updates.deliveryAddress !== company.deliveryAddress)
            || (updates.location !== undefined && (updates.location.lat !== company.location?.lat || updates.location.lng !== company.location?.lng));

        Object.assign(company, updates);
        await company.save();

        // A new office address applies to the meals still to come (the subscriptions keep a copy of it).
        if (addressChanged) {
            try {
                const zone = company.location?.lat !== undefined ? await detectZone(company.location.lat, company.location.lng) : null;
                const address = companyDeliveryAddress(company, zone?._id || null);
                const subs = await DMBSubscription.find({ source: 'office', companyId: company._id, status: { $in: [...LIVE, 'pending_payment'] } }).select('_id zoneId').lean();
                if (subs.length) {
                    const subIds = subs.map((s) => s._id);
                    await DMBSubscription.updateMany({ _id: { $in: subIds } }, { $set: { deliveryAddress: address } });
                    await DMBDailyOrder.updateMany(
                        { subscriptionId: { $in: subIds }, deliveryDate: { $gte: localToday() }, status: 'scheduled', addressOverridden: { $ne: true } },
                        { $set: { deliveryAddress: { street: address.street, city: address.city, state: address.state, label: address.label, location: address.location } } }
                    );
                    if (subs.some((s) => String(s.zoneId || '') !== String(zone?._id || ''))) {
                        logger.warn(`Office ${company._id} moved to another delivery zone: check that its vendors still deliver there`);
                    }
                }
            } catch (err) {
                logger.warn(`Updating the delivery address of office ${company._id}'s subscriptions failed: ${err.message}`);
            }
        }

        return sendResponse(res, 200, 'Company details updated successfully', company);
    } catch (error) {
        return fail(res, error);
    }
};

export const getOnboardingStatus = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const onboarding = await OfficeOnboarding.findOne({ accountId });
        return sendResponse(res, 200, 'Onboarding status retrieved', onboarding);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const startOnboarding = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const account = await OfficeAccount.findById(accountId).select('email').lean();
        const email = account?.email || req.body?.email;

        let onboarding = await OfficeOnboarding.findOne({ accountId });
        if (!onboarding) {
            onboarding = new OfficeOnboarding({
                accountId,
                email,
                currentStep: 'step1_profile'
            });
            await onboarding.save();
        }

        return sendResponse(res, 200, 'Onboarding started', onboarding);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const updateOnboardingStep = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const stepData = req.body;

        const onboarding = await OfficeOnboarding.findOne({ accountId });
        if (!onboarding) {
            return sendError(res, 404, 'Onboarding record not found');
        }

        // ... validation depending on currentStep
        // This is a simplified merge
        Object.assign(onboarding, stepData);

        // Auto-advance step
        if (onboarding.currentStep === 'step1_profile') {
            onboarding.currentStep = 'step2_docs';
        } else if (onboarding.currentStep === 'step2_docs') {
            onboarding.currentStep = 'step3_final';
        }

        await onboarding.save();

        return sendResponse(res, 200, 'Onboarding step updated', onboarding);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const completeOnboarding = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const onboarding = await OfficeOnboarding.findOne({ accountId });

        if (!onboarding) {
            return sendError(res, 404, 'Onboarding record not found');
        }

        onboarding.isCompleted = true;
        onboarding.currentStep = 'completed';
        onboarding.completedAt = new Date();
        await onboarding.save();

        // Create the actual OfficeCompany under review
        const company = new OfficeCompany({
            accountId: onboarding.accountId,
            legalName: onboarding.companyName,
            nip: onboarding.nip,
            regon: onboarding.regon,
            registeredAddress: onboarding.address,
            deliveryAddress: onboarding.address, // mapping for now
            contactName: onboarding.contactName,
            contactRole: onboarding.designation,
            contactEmail: onboarding.contactEmail,
            contactPhone: onboarding.phone,
            bankName: onboarding.bankName,
            accountName: onboarding.accountName,
            iban: onboarding.iban,
            status: 'under_review'
        });
        await company.save();

        // Link it back to the account
        await import('../models/officeAccount.model.js').then(async ({OfficeAccount}) => {
             await OfficeAccount.findByIdAndUpdate(accountId, { companyId: company._id, onboardingId: onboarding._id });
        });

        // Tell the admins (bell + push + email) that a new office is waiting for approval. Never blocks the response.
        try {
            const name = company.legalName || 'A company';
            void notifyAdminsSafely({
                title: 'New Office Approval Request 🏢',
                body: `${name} (NIP ${company.nip}) submitted its onboarding and is waiting for approval.`,
                data: { type: 'approval', subType: 'office_company', id: String(company._id), targetUrl: '/admin/food/office-approvals' }
            });
            const admins = await FoodAdmin.find({ isActive: true }).select('email').lean();
            for (const a of admins) {
                if (!a.email) continue;
                void sendOfficeNotificationEmail({
                    to: a.email,
                    subject: `New office approval request: ${name}`,
                    heading: 'A new office is waiting for approval',
                    lines: [`${name} (NIP ${company.nip}) has completed onboarding.`, 'Open Admin > Office Onboarding Requests to review the documents and approve or reject it.']
                });
            }
        } catch (notifyErr) {
            logger.warn(`Office approval notification failed: ${notifyErr.message}`);
        }

        return sendResponse(res, 200, 'Onboarding completed successfully. Company is under review.', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const deactivateCompanyAccount = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const company = await OfficeCompany.findOne({ accountId });
        if (!company) {
            return sendError(res, 404, 'Company details not found');
        }

        company.status = 'deactivated';
        await company.save();

        return sendResponse(res, 200, 'Company account deactivated successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// ─── NIP lookup (pre-fills the typable company fields in onboarding) ─────────

export const lookupCompanyByNip = async (req, res) => {
    try {
        const data = await lookupNip(req.params.nip);
        return sendResponse(res, 200, 'Company found', data);
    } catch (error) {
        if (error instanceof NipLookupError) return sendError(res, error.status, error.message);
        return sendError(res, 500, error.message);
    }
};
