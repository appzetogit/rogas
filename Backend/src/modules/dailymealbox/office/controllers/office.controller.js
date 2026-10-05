import mongoose from 'mongoose';
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
import { VendorSubscriptionPlan } from '../../subscription/vendorSubscriptionPlan.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, PaymentsError } from '../../../payments/payments.service.js';
import { resolvePaymentContext, resolveProviders } from '../../../payments/payments.settings.js';
import { PaymentTransaction } from '../../../payments/payments.models.js';
import { fulfilOfficePayment, OfficeAssignError } from '../office.assignment.service.js';
import { lookupNip, NipLookupError } from '../nipLookup.service.js';
import { notifyAdminsSafely } from '../../../../core/notifications/firebase.service.js';
import { sendOfficeNotificationEmail } from '../../../../utils/email.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { logger } from '../../../../utils/logger.js';

// ─── Employee Controllers ─────────────────────────────────────────────────────

export const getEmployees = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { search, department, status, sort = '-createdAt', page = 1, limit = 10 } = req.query;

        const query = { accountId };
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }
        if (department) query.department = department;
        if (status) query.status = status;

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const employees = await OfficeEmployee.find(query)
            .sort(sort)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await OfficeEmployee.countDocuments(query);

        return sendResponse(res, 200, 'Employees retrieved successfully', {
            employees,
            pagination: {
                total,
                page: parseInt(page),
                limit: parseInt(limit),
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const addEmployee = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const accountId = req.user.accountId;
        const employeeData = req.body;

        const company = await OfficeCompany.findOne({ accountId }).session(session);
        if (!company || company.status !== 'approved') {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 403, 'Company not approved for operations');
        }

        // Check limits if applicable
        if (company.totalEmployees >= 1000) {
            await session.abortTransaction();
            session.endSession();
            return sendError(res, 400, 'Employee limit reached');
        }

        let linkedUserId = null;
        if (employeeData.phone) {
            const digits = String(employeeData.phone).replace(/\D/g, '');

            let foodUser = await FoodUser.findOne({
                $or: [
                    { phone: employeeData.phone },
                    { phone: digits },
                    { phone: { $regex: new RegExp(digits.slice(-10) + '$') } }
                ]
            }).session(session);

            if (foodUser) {
                foodUser.name = foodUser.name || employeeData.name || '';
                foodUser.email = foodUser.email || employeeData.email || '';
                foodUser.role = 'EMPLOYEE';
                foodUser.companyId = company._id;
                foodUser.companyNip = company.nip || '';
                foodUser.companyName = company.legalName || '';
                foodUser.registeredAddress = company.registeredAddress || '';
                foodUser.deliveryAddress = company.deliveryAddress || '';
                foodUser.billingEmail = company.contactEmail || '';
                await foodUser.save({ session });
                linkedUserId = foodUser._id;
            } else {
                const newFoodUsers = await FoodUser.create([{
                    phone: employeeData.phone,
                    name: employeeData.name || '',
                    email: employeeData.email || '',
                    role: 'EMPLOYEE',
                    companyId: company._id,
                    companyNip: company.nip || '',
                    companyName: company.legalName || '',
                    registeredAddress: company.registeredAddress || '',
                    deliveryAddress: company.deliveryAddress || '',
                    billingEmail: company.contactEmail || '',
                    isVerified: true,
                    isActive: true,
                    subscriptionStatus: 'none'
                }], { session });
                linkedUserId = newFoodUsers[0]._id;
            }
        }

        const newEmployee = new OfficeEmployee({
            ...employeeData,
            accountId,
            companyId: company._id,
            companyNip: company.nip || '',
            companyName: company.legalName || '',
            registeredAddress: company.registeredAddress || '',
            deliveryAddress: company.deliveryAddress || '',
            billingEmail: company.contactEmail || '',
            userId: linkedUserId
        });

        await newEmployee.save({ session });

        company.totalEmployees += 1;
        await company.save({ session });

        await session.commitTransaction();
        session.endSession();

        return sendResponse(res, 201, 'Employee added successfully', newEmployee);
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        return sendError(res, 500, error.message);
    }
};

export const updateEmployee = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { id } = req.params;
        const updates = req.body;

        const company = await OfficeCompany.findOne({ accountId });
        if (company) {
            updates.companyNip = company.nip || '';
            updates.companyName = company.legalName || '';
            updates.registeredAddress = company.registeredAddress || '';
            updates.deliveryAddress = company.deliveryAddress || '';
            updates.billingEmail = company.contactEmail || '';
        }

        const employee = await OfficeEmployee.findOneAndUpdate(
            { _id: id, accountId },
            updates,
            { new: true, runValidators: true }
        );

        if (!employee) {
            return sendError(res, 404, 'Employee not found');
        }

        // Sync details to FoodUser if linked
        if (employee.userId) {
            const userUpdates = {};
            if (updates.name !== undefined) userUpdates.name = updates.name;
            if (updates.email !== undefined) userUpdates.email = updates.email;
            if (updates.phone !== undefined) userUpdates.phone = updates.phone;

            if (company) {
                userUpdates.companyNip = company.nip || '';
                userUpdates.companyName = company.legalName || '';
                userUpdates.registeredAddress = company.registeredAddress || '';
                userUpdates.deliveryAddress = company.deliveryAddress || '';
                userUpdates.billingEmail = company.contactEmail || '';
            }

            if (Object.keys(userUpdates).length > 0) {
                await FoodUser.findByIdAndUpdate(employee.userId, userUpdates);
            }
        }

        return sendResponse(res, 200, 'Employee updated successfully', employee);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const deleteEmployee = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { id } = req.params;

        const employee = await OfficeEmployee.findOneAndDelete({ _id: id, accountId });
        if (!employee) {
            return sendError(res, 404, 'Employee not found');
        }

        // Delete their assignments
        await OfficeMealAssignment.deleteMany({ employeeId: id, accountId });

        // Decrement totalEmployees
        await OfficeCompany.findOneAndUpdate({ accountId }, { $inc: { totalEmployees: -1 } });

        return sendResponse(res, 200, 'Employee deleted successfully');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// --- Vendor & Meal Assignment ---

export const getVendors = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const company = await OfficeCompany.findOne({ accountId });
        
        let vendorQuery = { status: 'approved' };

        const vendors = await FoodRestaurant.find(vendorQuery)
            .select('restaurantName vendorType cuisines rating profileImage coverImages location mealSlots')
            .lean();

        // Join Meal Plans
        for (let vendor of vendors) {
            const plans = await DMBMealPlan.find({ vendorId: vendor._id, status: 'active' }).lean();
            vendor.mealPlans = plans;
        }

        return sendResponse(res, 200, 'Vendors retrieved successfully', vendors);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

/** How many delivery days a VendorSubscriptionPlan's duration covers. */
export const daysForSubscriptionPlan = (subPlan) => {
    const monFri = subPlan.deliveryDays === 'mon_fri';
    return subPlan.duration === 'day' ? 1 : subPlan.duration === 'week' ? (monFri ? 5 : 7) : (monFri ? 20 : 30);
};

/**
 * The minimum an office order for `employeeCount` employees can cost: the vendor's own meal price (never the
 * admin's) for the plan's full duration, once per employee. Exported so tests can check this directly.
 */
export const officeAssignmentPlanFloor = ({ subPlan, mealPlan, employeeCount }) =>
    Math.round(Number(mealPlan.pricePerDay || 0) * daysForSubscriptionPlan(subPlan) * employeeCount * 100) / 100;

export const createAssignmentOrder = async (req, res) => {
    let pending = null;
    try {
        const accountId = req.user.accountId;
        const { employeeIds, subscriptionPlanId, vendorId, slots, totalAmount, mealPlanId, startDate, planType, provider, returnPath, cancelPath, language } = req.body;

        if (!employeeIds || employeeIds.length === 0 || !subscriptionPlanId || !slots || slots.length === 0) {
            return sendError(res, 400, 'Missing required fields: employeeIds, subscriptionPlanId, slots');
        }
        if (!mealPlanId) return sendError(res, 400, 'mealPlanId is required (the vendor meal plan being assigned)');

        // Duration/fee policy (admin-set, shared across vendors) and the vendor's own meal price (vendor-set).
        const [subPlan, mealPlan] = await Promise.all([
            VendorSubscriptionPlan.findById(subscriptionPlanId).lean(),
            DMBMealPlan.findById(mealPlanId).select('pricePerDay vendorId').lean()
        ]);
        if (!subPlan) return sendError(res, 404, 'Subscription plan not found');
        if (subPlan.vendorId && vendorId && String(subPlan.vendorId) !== String(vendorId)) return sendError(res, 400, 'That plan belongs to another vendor');
        if (!mealPlan) return sendError(res, 404, 'Meal plan not found');
        if (vendorId && String(mealPlan.vendorId) !== String(vendorId)) return sendError(res, 400, 'That meal plan does not belong to the selected vendor');

        // The total is worked out in the browser (it includes VAT and fees). Never accept less than the vendor's own
        // meal price for the full plan duration costs.
        const planFloor = officeAssignmentPlanFloor({ subPlan, mealPlan, employeeCount: employeeIds.length });
        const finalAmount = totalAmount ? Number(totalAmount) : planFloor;
        if (!Number.isFinite(finalAmount) || finalAmount + 0.01 < planFloor) {
            return sendError(res, 400, 'The price has changed. Please reload and try again.');
        }

        // Country and currency follow the vendor's zone (where the meals are cooked and delivered).
        const company = await OfficeCompany.findOne({ accountId });
        let zoneId = null;
        if (vendorId) zoneId = (await FoodRestaurant.findById(vendorId).select('zoneId').lean())?.zoneId;
        const ctx = await resolvePaymentContext({ zoneId });
        const available = await resolveProviders({ country: ctx.country, currency: ctx.currency });
        if (!available.length) return sendError(res, 503, 'No payment method is available for your region right now. Please contact support.');

        // A pending record holds everything needed to deliver the order once the payment is confirmed.
        pending = await OfficePayment.create({
            accountId,
            companyId: company?._id,
            razorpayOrderId: `pending_${accountId}_${Date.now()}`,
            subscriptionPlanId,
            vendorId: vendorId || null,
            mealPlanId: mealPlanId || null,
            startDate: startDate ? new Date(startDate) : null,
            planType: planType || '',
            employeeIds,
            slots,
            amount: finalAmount,
            currency: ctx.currency,
            status: 'pending'
        });

        const { payment } = await startPayment({
            purpose: 'office',
            ownerType: 'office',
            ownerId: accountId,
            amount: finalAmount,
            currency: ctx.currency,
            country: ctx.country,
            provider,
            description: `Office meal subscription (${employeeIds.length} ${employeeIds.length === 1 ? 'employee' : 'employees'})`,
            customer: { name: company?.legalName, email: company?.contactEmail, phone: company?.contactPhone },
            language,
            returnPath: returnPath || '/office/payments',
            cancelPath: cancelPath || '/office/vendors',
            refs: { officePaymentId: String(pending._id) }
        });

        pending.razorpayOrderId = payment.provider === 'razorpay' ? payment.action.orderId : payment.transactionId;
        pending.paymentTransactionId = payment.transactionId;
        pending.provider = payment.provider;
        await pending.save();

        const data = { payment, orderId: pending.razorpayOrderId, amount: payment.amountMinor, currency: payment.currency, isMock: payment.provider === 'mock' };
        if (payment.provider === 'razorpay') data.razorpayKeyId = payment.action.key;
        return sendResponse(res, 200, 'Order created successfully', data);
    } catch (error) {
        if (pending) await OfficePayment.deleteOne({ _id: pending._id, status: 'pending' }).catch(() => {});
        if (error instanceof PaymentsError) return sendError(res, error.statusCode, error.message);
        return sendError(res, 500, error.message);
    }
};

/**
 * Finishes an office purchase. The browser calls this after paying (Razorpay pop-up or returning from a hosted page).
 * Meal plans are assigned only once the payment is confirmed, either now or already by the payment webhook.
 */
export const assignMealPlan = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { mealPlanId, startDate, planType, transactionId, razorpayOrderId } = req.body;

        const office = await OfficePayment.findOne(
            transactionId
                ? { accountId, paymentTransactionId: String(transactionId) }
                : { accountId, razorpayOrderId: String(razorpayOrderId || '') }
        );
        if (!office || !(transactionId || razorpayOrderId)) return sendError(res, 402, 'Payment is required to assign a meal plan');

        // Older clients only send these now; the order itself may not have them yet.
        if (!office.fulfilledAt) {
            if (!office.mealPlanId && mealPlanId) office.mealPlanId = mealPlanId;
            if (!office.startDate && startDate) office.startDate = new Date(startDate);
            if (!office.planType && planType) office.planType = planType;
            if (office.isModified()) await office.save();
        }

        const tx = await findOwnedTransaction({ publicId: office.paymentTransactionId, purpose: 'office', ownerId: accountId });
        if (!tx) return sendError(res, 404, 'Payment not found');
        if (tx.provider === 'razorpay' && req.body.razorpayPaymentId && !['paid', 'partially_refunded', 'refunded'].includes(tx.status)) {
            await confirmRazorpayPayment(tx, { ...req.body, razorpayOrderId: tx.providerOrderId });
        }
        const fresh = await PaymentTransaction.findById(tx._id);
        if (!['paid', 'partially_refunded', 'refunded'].includes(fresh.status)) return sendError(res, 402, 'Payment has not been completed yet');

        // The confirmation above normally delivers the order already; this covers the case where it did not yet.
        const { assignments } = await fulfilOfficePayment(office._id, { paymentTxId: fresh.publicId, providerPaymentId: fresh.providerPaymentId });
        return sendResponse(res, 200, 'Meal plan assigned successfully', assignments);
    } catch (error) {
        if (error instanceof PaymentsError || error instanceof OfficeAssignError) return sendError(res, error.statusCode || 400, error.message);
        return sendError(res, 500, error.message);
    }
};

export const getAssignments = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        
        const assignments = await OfficeMealAssignment.find({ accountId })
            .populate('employeeId', 'name email department employeeId')
            .populate('vendorId', 'restaurantName profileImage')
            .populate('mealPlanId', 'name price type')
            .sort('-createdAt');

        return sendResponse(res, 200, 'Assignments retrieved successfully', assignments);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const deleteAssignment = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { id } = req.params;
        
        const assignment = await OfficeMealAssignment.findOneAndDelete({ _id: id, accountId });
        if (!assignment) {
            return sendError(res, 404, 'Assignment not found');
        }

        // Cancel subscription if linked
        if (assignment.subscriptionId) {
            await DMBSubscription.findByIdAndUpdate(assignment.subscriptionId, { status: 'cancelled' });
        }

        // Clear employee record
        await OfficeEmployee.findByIdAndUpdate(assignment.employeeId, {
            $unset: { assignedVendorId: 1, assignedMealPlanId: 1, deliverySlot: 1 },
            subscriptionStatus: 'cancelled'
        });

        return sendResponse(res, 200, 'Assignment deleted successfully');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
}

// ─── Payment Controllers ──────────────────────────────────────────────

export const getPayments = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        
        const payments = await OfficePayment.find({ accountId })
            .populate('vendorId', 'restaurantName profileImage')
            .populate('subscriptionPlanId', 'name duration deliveryDays')
            .populate('employeeIds', 'name email department')
            .sort('-createdAt');

        return sendResponse(res, 200, 'Payments retrieved successfully', payments);
    } catch (error) {
        return sendError(res, 500, error.message);
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

        // Calculate active vendors count
        const activeVendors = await OfficeMealAssignment.distinct('vendorId', {
            accountId,
            status: 'active'
        });
        company.activeVendorsCount = activeVendors.length;

        // Optionally, calculate total employees if needed dynamically, but we'll leave it as is if it's fine.
        
        return sendResponse(res, 200, 'Company details retrieved successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const updateCompanyDetails = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const updates = req.body;

        const company = await OfficeCompany.findOneAndUpdate(
            { accountId },
            updates,
            { new: true, upsert: true }
        );

        return sendResponse(res, 200, 'Company details updated successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
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
