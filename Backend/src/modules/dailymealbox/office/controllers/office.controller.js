import mongoose from 'mongoose';
import { OfficeEmployee } from '../models/officeEmployee.model.js';
import { OfficeMealAssignment } from '../models/officeMealAssignment.model.js';
import { OfficeCompany } from '../models/officeCompany.model.js';
import { OfficeOnboarding } from '../models/officeOnboarding.model.js';
import { OfficePayment } from '../models/officePayment.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../../food/restaurant/models/restaurant.model.js';
import { DMBMealPlan } from '../../mealplan/mealPlan.model.js';
import { DMBSubscription } from '../../subscription/subscription.model.js';
import { VendorSubscriptionPlan } from '../../subscription/vendorSubscriptionPlan.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { createRazorpayOrder, verifyPaymentSignature, isRazorpayConfigured, getRazorpayKeyId } from '../../../food/orders/helpers/razorpay.helper.js';

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

export const createAssignmentOrder = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { employeeIds, subscriptionPlanId, vendorId, slots, totalAmount } = req.body;

        if (!employeeIds || employeeIds.length === 0 || !subscriptionPlanId || !slots || slots.length === 0) {
            return sendError(res, 400, 'Missing required fields: employeeIds, subscriptionPlanId, slots');
        }

        // Lookup the admin-created subscription plan
        const subPlan = await VendorSubscriptionPlan.findById(subscriptionPlanId);
        if (!subPlan) return sendError(res, 404, 'Subscription plan not found');

        // Use the pre-calculated totalAmount from frontend (already includes VAT etc)
        // Fallback to plan price * employees if not provided
        const finalAmount = totalAmount ? Number(totalAmount) : subPlan.price * employeeIds.length;
        const amountPaise = Math.round(finalAmount * 100);

        let orderId = 'mock_order_' + Date.now();
        const isMock = !isRazorpayConfigured();

        if (!isMock) {
            const rzOrder = await createRazorpayOrder(amountPaise, 'INR', 'off_' + Date.now());
            orderId = rzOrder.id;
        }

        // Create a pending payment record
        const company = await OfficeCompany.findOne({ accountId });
        await OfficePayment.create({
            accountId,
            companyId: company?._id,
            razorpayOrderId: orderId,
            subscriptionPlanId,
            vendorId: vendorId || null,
            employeeIds,
            slots,
            amount: finalAmount,
            currency: 'INR',
            status: 'pending',
            isMock
        });

        return sendResponse(res, 200, 'Order created successfully', {
            orderId,
            amount: amountPaise,
            currency: 'INR',
            razorpayKeyId: getRazorpayKeyId(),
            isMock
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const assignMealPlan = async (req, res) => {
    try {
        const accountId = req.user.accountId;
        const { employeeIds, vendorId, mealPlanId, subscriptionPlanId, startDate, slots, planType, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        if (!employeeIds || employeeIds.length === 0 || !vendorId || !mealPlanId || !slots || slots.length === 0) {
            return sendError(res, 400, 'Missing required assignment fields');
        }

        // Razorpay Verification
        if (isRazorpayConfigured() && razorpayOrderId && razorpayPaymentId && razorpaySignature) {
            const isValid = verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);
            if (!isValid) {
                return sendError(res, 400, 'Invalid payment signature');
            }
        }

        const company = await OfficeCompany.findOne({ accountId });
        if (!company) {
             return sendError(res, 404, 'Company not found');
        }

        // ── Fetch the actual meal plan to get real pricing and name ─────────────
        const mealPlan = await DMBMealPlan.findById(mealPlanId);
        const pricePerDay = mealPlan ? Number(mealPlan.pricePerDay || 0) : 0;
        const normalizedSlots = Array.isArray(slots) ? slots.map(s => s.toLowerCase()) : [slots.toLowerCase()];

        // ── Fetch the VendorSubscriptionPlan to get the correct duration ─────────
        // The frontend always sends subscriptionPlanId; planType in the body is NOT
        // reliably sent and must NOT be used as a fallback for plan duration logic.
        let resolvedPlanDuration = 'month'; // safe default
        let resolvedDeliveryDays = 'full_week';
        let resolvedDaysCount = 0;

        if (subscriptionPlanId) {
            const vendorSubPlan = await VendorSubscriptionPlan.findById(subscriptionPlanId);
            if (vendorSubPlan) {
                resolvedPlanDuration = vendorSubPlan.duration || 'month';   // 'day' | 'week' | 'month'
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
        const addressParts = rawAddress.split(',').map(p => p.trim()).filter(Boolean);
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

            if (user) {
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
                        currency: 'INR'
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
                user.deliverySlot = normalizedSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
                await user.save();
            }

            // ────────────────────────────────────────────────────────────────

            // Update employee's denormalized fields
            employee.assignedVendorId = vendorId;
            employee.assignedMealPlanId = mealPlanId;
            employee.deliverySlot = normalizedSlots.map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(', ');
            employee.subscriptionStatus = 'active';
            await employee.save();
        }

        // Save payment as paid in history
        await OfficePayment.findOneAndUpdate(
            { razorpayOrderId: razorpayOrderId },
            { 
                razorpayPaymentId, 
                razorpaySignature,
                status: 'paid'
            }
        );

        return sendResponse(res, 200, 'Meal plan assigned successfully', assignments);
    } catch (error) {
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
        const { email } = req.body;

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

        return sendResponse(res, 200, 'Onboarding completed successfully. Company is under review.', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};
