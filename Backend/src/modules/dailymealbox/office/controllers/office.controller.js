import { OfficeEmployee } from '../models/officeEmployee.model.js';
import { OfficeMealAssignment } from '../models/officeMealAssignment.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodRestaurant } from '../../../food/restaurant/models/restaurant.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

// --- Employee Management ---

export const getEmployees = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const employees = await OfficeEmployee.find({ adminId }).sort({ createdAt: -1 });
        return sendResponse(res, 200, 'Employees retrieved successfully', employees);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const addEmployee = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { name, email, department, budget, preferredSlot, status, phone } = req.body;

        if (!name || !email) {
            return sendError(res, 400, 'Name and email are required');
        }

        const newEmployee = new OfficeEmployee({
            adminId,
            name,
            email,
            phone,
            department,
            budget,
            preferredSlot,
            status
        });

        await newEmployee.save();
        return sendResponse(res, 201, 'Employee added successfully', newEmployee);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const updateEmployee = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { id } = req.params;
        const updates = req.body;

        const employee = await OfficeEmployee.findOneAndUpdate(
            { _id: id, adminId },
            updates,
            { new: true }
        );

        if (!employee) {
            return sendError(res, 404, 'Employee not found');
        }

        return sendResponse(res, 200, 'Employee updated successfully', employee);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const deleteEmployee = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { id } = req.params;

        const employee = await OfficeEmployee.findOneAndDelete({ _id: id, adminId });
        if (!employee) {
            return sendError(res, 404, 'Employee not found');
        }

        // Also delete their assignments
        await OfficeMealAssignment.deleteMany({ employeeId: id, adminId });

        return sendResponse(res, 200, 'Employee deleted successfully');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

// --- Vendor & Meal Assignment ---

export const getVendors = async (req, res) => {
    try {
        // Fetch approved vendors
        const vendors = await FoodRestaurant.find({ status: 'approved', isActive: true })
            .select('restaurantName vendorType cuisines rating profileImage location mealSlots')
            .lean();
        return sendResponse(res, 200, 'Vendors retrieved successfully', vendors);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const assignMeals = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { employeeIds, vendorId, mealSlot, validUntil } = req.body;

        if (!employeeIds || !employeeIds.length || !vendorId || !mealSlot) {
            return sendError(res, 400, 'Missing required fields for assignment');
        }

        const assignments = [];
        for (const empId of employeeIds) {
            const assignment = new OfficeMealAssignment({
                adminId,
                employeeId: empId,
                vendorId,
                mealSlot,
                validUntil: validUntil || null
            });
            await assignment.save();
            assignments.push(assignment);
        }

        return sendResponse(res, 201, 'Meals assigned successfully', assignments);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const getAssignments = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const assignments = await OfficeMealAssignment.find({ adminId })
            .populate('employeeId', 'name email department profileImage')
            .populate('vendorId', 'restaurantName vendorType profileImage')
            .sort({ createdAt: -1 });
        return sendResponse(res, 200, 'Assignments retrieved successfully', assignments);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const deleteAssignment = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { id } = req.params;
        const assignment = await OfficeMealAssignment.findOneAndDelete({ _id: id, adminId });
        if (!assignment) {
            return sendError(res, 404, 'Assignment not found');
        }
        return sendResponse(res, 200, 'Assignment deleted successfully');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
}

// --- Company Details ---

export const getCompanyDetails = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const user = await FoodUser.findById(adminId).select('companyName companyNip companyAddress billingEmail phone name');
        if (!user) {
            return sendError(res, 404, 'Admin not found');
        }
        return sendResponse(res, 200, 'Company details retrieved successfully', user);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const updateCompanyDetails = async (req, res) => {
    try {
        const adminId = req.user.userId;
        const { companyName, companyNip, companyAddress, billingEmail } = req.body;

        const user = await FoodUser.findByIdAndUpdate(
            adminId,
            { companyName, companyNip, companyAddress, billingEmail },
            { new: true }
        ).select('companyName companyNip companyAddress billingEmail phone name');

        return sendResponse(res, 200, 'Company details updated successfully', user);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};
