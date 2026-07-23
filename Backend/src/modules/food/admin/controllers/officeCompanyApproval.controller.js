import { OfficeCompany } from '../../../dailymealbox/office/models/officeCompany.model.js';
import { OfficeOnboarding } from '../../../dailymealbox/office/models/officeOnboarding.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export const getOfficeCompanies = async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status) {
            if (status.includes(',')) {
                query.status = { $in: status.split(',') };
            } else {
                query.status = status;
            }
        }

        const companies = await OfficeCompany.find(query)
            .populate('accountId', 'email')
            .sort({ createdAt: -1 })
            .lean();
            
        // Fetch onboarding data for each company
        for (let company of companies) {
            const onboarding = await OfficeOnboarding.findOne({ accountId: company.accountId });
            company.onboardingData = onboarding;
        }

        return sendResponse(res, 200, 'Office companies retrieved successfully', companies);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const approveOfficeCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await OfficeCompany.findByIdAndUpdate(
            id,
            { status: 'approved' },
            { new: true }
        );

        if (!company) {
            return sendError(res, 404, 'Office company not found');
        }

        return sendResponse(res, 200, 'Office company approved successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const rejectOfficeCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await OfficeCompany.findByIdAndUpdate(
            id,
            { status: 'rejected' },
            { new: true }
        );

        if (!company) {
            return sendError(res, 404, 'Office company not found');
        }

        return sendResponse(res, 200, 'Office company rejected successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const deactivateOfficeCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await OfficeCompany.findByIdAndUpdate(
            id,
            { status: 'deactivated' },
            { new: true }
        );
        if (!company) return sendError(res, 404, 'Office company not found');
        return sendResponse(res, 200, 'Office company deactivated successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const activateOfficeCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const company = await OfficeCompany.findByIdAndUpdate(
            id,
            { status: 'approved' },
            { new: true }
        );
        if (!company) return sendError(res, 404, 'Office company not found');
        return sendResponse(res, 200, 'Office company activated successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};
