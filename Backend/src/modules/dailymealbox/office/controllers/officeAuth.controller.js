import { signAccessToken } from '../../../../core/auth/token.util.js';
import { OfficeAccount } from '../models/officeAccount.model.js';
import { OfficeCompany } from '../models/officeCompany.model.js';
import { OfficeOnboarding } from '../models/officeOnboarding.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

const generateToken = (account) => {
    return signAccessToken({ accountId: account._id, role: 'OFFICE_ADMIN' });
};

export const registerOfficeAccount = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return sendError(res, 400, 'Email and password are required');
        }

        const existingAccount = await OfficeAccount.findOne({ email });
        if (existingAccount) {
            return sendError(res, 400, 'Email already in use');
        }

        const newAccount = new OfficeAccount({ email, password });
        await newAccount.save();

        const token = generateToken(newAccount);

        return sendResponse(res, 201, 'Account created successfully', {
            account: { id: newAccount._id, email: newAccount.email },
            accessToken: token
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const loginOfficeAccount = async (req, res) => {
    try {
        const { email, password } = req.body;

        const account = await OfficeAccount.findOne({ email });
        if (!account) {
            return sendError(res, 401, 'Invalid email or password');
        }

        if (account.status === 'blocked') {
            return sendError(res, 403, 'Your account is blocked');
        }

        const company = await OfficeCompany.findOne({ accountId: account._id });
        if (company && company.status === 'deactivated') {
            return sendError(res, 403, 'Your account has been deactivated. Please contact support.');
        }

        const isMatch = await account.comparePassword(password);
        if (!isMatch) {
            return sendError(res, 401, 'Invalid email or password');
        }

        const token = generateToken(account);

        return sendResponse(res, 200, 'Logged in successfully', {
            account: { id: account._id, email: account.email },
            accessToken: token
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};
