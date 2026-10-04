import { OfficeCompany } from '../../../dailymealbox/office/models/officeCompany.model.js';
import { OfficeOnboarding } from '../../../dailymealbox/office/models/officeOnboarding.model.js';
import { OfficeAccount } from '../../../dailymealbox/office/models/officeAccount.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { sendOfficeNotificationEmail } from '../../../../utils/email.js';
import { logger } from '../../../../utils/logger.js';

// Tells the company (by email) about the admin's decision. A mail problem must never undo the decision.
const emailCompany = async (company, subject, heading, lines) => {
    try {
        const account = await OfficeAccount.findById(company.accountId).select('email').lean();
        const to = account?.email || company.contactEmail;
        if (to) await sendOfficeNotificationEmail({ to, subject, heading, lines });
    } catch (err) {
        logger.warn(`Office decision email failed for ${company._id}: ${err.message}`);
    }
};

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
            { status: 'approved', rejectionReason: '' },
            { new: true }
        );

        if (!company) {
            return sendError(res, 404, 'Office company not found');
        }

        void emailCompany(company, 'Your DailyMealBox office account is approved', 'Your company has been approved', [
            `Good news: ${company.legalName} has been approved.`,
            'You can now log in to the Office panel and start assigning meal plans to your team.'
        ]);

        return sendResponse(res, 200, 'Office company approved successfully', company);
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const rejectOfficeCompany = async (req, res) => {
    try {
        const { id } = req.params;
        const reason = String(req.body?.reason || '').trim().slice(0, 500);
        const company = await OfficeCompany.findByIdAndUpdate(
            id,
            { status: 'rejected', rejectionReason: reason },
            { new: true }
        );

        if (!company) {
            return sendError(res, 404, 'Office company not found');
        }

        void emailCompany(company, 'Update on your DailyMealBox office application', 'Your application was not approved', [
            `We could not approve ${company.legalName} at this time.`,
            reason ? `Reason: ${reason}` : 'Please contact support for details.'
        ]);

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
