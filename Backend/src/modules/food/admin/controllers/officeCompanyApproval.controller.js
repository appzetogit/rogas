import { OfficeCompany } from '../../../dailymealbox/office/models/officeCompany.model.js';
import { OfficeOnboarding } from '../../../dailymealbox/office/models/officeOnboarding.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export const getOfficeCompanies = async (req, res) => {
    try {
        const { status } = req.query;
        let query = {};
        if (status) query.status = status;

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
