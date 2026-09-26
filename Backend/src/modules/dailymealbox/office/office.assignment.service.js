import { OfficeEmployee } from './models/officeEmployee.model.js';
import { OfficeMealAssignment } from './models/officeMealAssignment.model.js';
import { OfficeCompany } from './models/officeCompany.model.js';
import { OfficePayment } from './models/officePayment.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { VendorSubscriptionPlan } from '../subscription/vendorSubscriptionPlan.model.js';
import { assertValidSlotKeys, listSlots, getSlotLabel } from '../deliverySlot/deliverySlot.service.js';

export class OfficeAssignError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.name = 'OfficeAssignError';
        this.statusCode = statusCode;
    }
}

/**
 * Creates the meal assignments (and the employees' subscriptions) for a paid office order.
 * This used to run straight from the browser after the payment pop-up; it now runs only once a payment has been
 * confirmed (see fulfilOfficePayment).
 */
export const assignMealPlanForAccount = async ({ accountId, employeeIds, vendorId, mealPlanId, subscriptionPlanId, startDate, slots, planType, currency = 'INR' }) => {
    if (!employeeIds || employeeIds.length === 0 || !vendorId || !mealPlanId || !slots || slots.length === 0) {
        throw new OfficeAssignError('Missing required assignment fields');
    }

    const company = await OfficeCompany.findOne({ accountId });
    if (!company) throw new OfficeAssignError('Company not found', 404);

    // ── Fetch the actual meal plan to get real pricing and name ─────────────
    const mealPlan = await DMBMealPlan.findById(mealPlanId);
    const pricePerDay = mealPlan ? Number(mealPlan.pricePerDay || 0) : 0;
    const normalizedSlots = Array.isArray(slots) ? slots.map((s) => s.toLowerCase()) : [slots.toLowerCase()];
    await assertValidSlotKeys(normalizedSlots);
    const _slotDefs = await listSlots();
    const slotDisplay = (keys) => keys.map((k) => getSlotLabel(_slotDefs, k)).join(', ');

    // ── Fetch the VendorSubscriptionPlan to get the correct duration ─────────
    // The frontend always sends subscriptionPlanId; planType in the body is NOT
    // reliably sent and must NOT be used as a fallback for plan duration logic.
    let resolvedPlanDuration = 'month'; // safe default
    let resolvedDeliveryDays = 'full_week';
    let resolvedDaysCount = 0;

    if (subscriptionPlanId) {
        const vendorSubPlan = await VendorSubscriptionPlan.findById(subscriptionPlanId);
        if (vendorSubPlan) {
            resolvedPlanDuration = vendorSubPlan.duration || 'month'; // 'day' | 'week' | 'month'
            resolvedDeliveryDays = vendorSubPlan.deliveryDays || 'full_week'; // 'mon_fri' | 'full_week'
            resolvedDaysCount = vendorSubPlan.daysCount || 0;
        }
    } else if (planType) {
        // Fallback: honour an explicitly provided planType if subscriptionPlanId is missing
        resolvedPlanDuration = planType.toLowerCase();
    }

    // ── Parse company delivery address into structured fields ───────────────
    // The company stores address as a single string; we try to extract parts.
    const rawAddress = company.deliveryAddress || company.registeredAddress || 'Office Address';
    // Split by comma to get city/state hints: "Street, City, State ZIP"
    const addressParts = rawAddress.split(',').map((p) => p.trim()).filter(Boolean);
    const companyDeliveryAddress = {
        label: 'Office',
        fullName: company.legalName || '',
        street: addressParts[0] || 'Office Address',
        city: addressParts[1] || addressParts[0] || 'Office City',
        state: addressParts[2] || addressParts[1] || addressParts[0] || 'Office State',
        zipCode: addressParts[3] || '',
        phone: company.contactPhone || ''
    };

    const assignments = [];

    for (const empId of employeeIds) {
        const employee = await OfficeEmployee.findById(empId);
        if (!employee) continue;

        // Upsert assignment
        let assignment = await OfficeMealAssignment.findOne({ employeeId: empId, accountId });

        if (assignment) {
            assignment.vendorId = vendorId;
            assignment.mealPlanId = mealPlanId;
            assignment.mealSlots = normalizedSlots;
            assignment.startDate = startDate || new Date();
            assignment.status = 'active';
            await assignment.save();
        } else {
            assignment = new OfficeMealAssignment({
                accountId,
                companyId: company._id,
                employeeId: empId,
                vendorId,
                mealPlanId,
                mealSlots: normalizedSlots,
                startDate: startDate || new Date()
            });
            await assignment.save();
        }

        assignments.push(assignment);

        // ── Resolve FoodUser strictly using userId ─────────────
        let user = null;
        if (employee.userId) {
            user = await FoodUser.findById(employee.userId);
        }
        if (!user) {
            // Missing FoodUser link, skip assignment for this employee
            continue;
        }

        // Cancel any old active/paused subscription from office for this user
        await DMBSubscription.updateMany(
            { userId: user._id, source: 'office', status: { $in: ['active', 'paused'] } },
            { status: 'cancelled', cancelledAt: new Date(), cancellationReason: 'Replaced by new office assignment' }
        );

        // Calculate end date and working days based on the resolved plan from VendorSubscriptionPlan
        const subscriptionStartDate = startDate ? new Date(startDate) : new Date();
        const subscriptionEndDate = new Date(subscriptionStartDate);

        let workingDays;

        if (resolvedPlanDuration === 'day') {
            subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 1);
            workingDays = 1;
        } else if (resolvedPlanDuration === 'week') {
            subscriptionEndDate.setDate(subscriptionEndDate.getDate() + 7);
            // mon_fri = 5 delivery days, full_week = 7 delivery days
            workingDays = resolvedDeliveryDays === 'mon_fri' ? 5 : 7;
        } else {
            // 'month' — use resolvedDeliveryDays to determine working days
            subscriptionEndDate.setMonth(subscriptionEndDate.getMonth() + 1);
            workingDays = resolvedDeliveryDays === 'mon_fri' ? 22 : 30;
        }

        // If the admin has explicitly stored a daysCount on the plan, prefer that
        if (resolvedDaysCount > 0) {
            workingDays = resolvedDaysCount;
        }

        const calculatedTotalPrice = pricePerDay * workingDays;

        const newSub = new DMBSubscription({
            userId: user._id,
            vendorId,
            mealPlanId,
            meals: mealPlanId ? [{ mealPlanId, quantity: 1 }] : [],
            status: 'active',
            startDate: subscriptionStartDate,
            endDate: subscriptionEndDate,
            duration: resolvedPlanDuration,
            deliverySlot: normalizedSlots[0],
            deliverySlots: normalizedSlots,
            deliveryDays: resolvedDeliveryDays,
            deliveryAddress: companyDeliveryAddress,
            pricing: {
                basePricePerDay: pricePerDay,
                deliveryFeePerDay: 0,
                totalPrice: calculatedTotalPrice,
                currency
            },
            paymentMethod: 'cash',
            autoRenew: true,
            source: 'office',
            companyId: company._id,
            // B2B Invoice details
            companyName: company.legalName || '',
            companyNip: company.nip || '',
            billingEmail: company.contactEmail || '',
            invoiceType: 'b2b_vat'
        });
        await newSub.save();

        // Link subscriptionId back to the assignment
        assignment.subscriptionId = newSub._id;
        await assignment.save();

        // Update FoodUser's subscriptionStatus and deliverySlot
        user.subscriptionStatus = 'active';
        user.deliverySlot = slotDisplay(normalizedSlots);
        await user.save();

        // Update employee's denormalized fields
        employee.assignedVendorId = vendorId;
        employee.assignedMealPlanId = mealPlanId;
        employee.deliverySlot = slotDisplay(normalizedSlots);
        employee.subscriptionStatus = 'active';
        await employee.save();
    }

    return assignments;
};

/**
 * Delivers a paid office order: creates the assignments once, then marks the OfficePayment as paid and fulfilled.
 * Safe to call again (a second call returns the existing assignments).
 */
export const fulfilOfficePayment = async (officePaymentId, meta = {}) => {
    const pay = await OfficePayment.findById(officePaymentId);
    if (!pay) throw new OfficeAssignError('Office payment not found', 404);
    if (pay.fulfilledAt) return { payment: pay, assignments: await OfficeMealAssignment.find({ accountId: pay.accountId, employeeId: { $in: pay.employeeIds } }) };
    if (!pay.mealPlanId || !pay.vendorId) throw new OfficeAssignError('Office payment is missing the meal plan or vendor');

    const assignments = await assignMealPlanForAccount({
        accountId: pay.accountId,
        employeeIds: pay.employeeIds,
        vendorId: pay.vendorId,
        mealPlanId: pay.mealPlanId,
        subscriptionPlanId: pay.subscriptionPlanId,
        startDate: pay.startDate,
        slots: pay.slots,
        planType: pay.planType,
        currency: pay.currency
    });

    pay.status = 'paid';
    pay.fulfilledAt = new Date();
    if (meta.paymentTxId) pay.paymentTransactionId = meta.paymentTxId;
    if (meta.providerPaymentId) pay.razorpayPaymentId = meta.providerPaymentId;
    await pay.save();
    return { payment: pay, assignments };
};
