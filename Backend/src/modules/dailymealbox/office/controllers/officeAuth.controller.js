import crypto from 'crypto';
import { signAccessToken } from '../../../../core/auth/token.util.js';
import { OfficeAccount } from '../models/officeAccount.model.js';
import { OfficeCompany } from '../models/officeCompany.model.js';
import { OfficeOnboarding } from '../models/officeOnboarding.model.js';
import { OfficeOtp } from '../models/officeOtp.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { sendOfficeSignupOtpEmail } from '../../../../utils/email.js';

const generateToken = (account) => {
    return signAccessToken({ accountId: account._id, role: 'OFFICE_ADMIN' });
};

export const sendOfficeOtp = async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return sendError(res, 400, 'Email is required');
        }

        const normalizedEmail = email.toLowerCase().trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(normalizedEmail)) {
            return sendError(res, 400, 'Please provide a valid email address');
        }

        const existingAccount = await OfficeAccount.findOne({ email: normalizedEmail });
        if (existingAccount) {
            return sendError(res, 400, 'An account with this email already exists');
        }

        // Generate 6-digit OTP
        const otp = String(crypto.randomInt(100000, 999999));
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

        await OfficeOtp.findOneAndUpdate(
            { email: normalizedEmail },
            { otp, expiresAt, attempts: 0 },
            { upsert: true, new: true }
        );

        const sent = await sendOfficeSignupOtpEmail(normalizedEmail, otp);
        if (!sent) {
            return sendError(res, 500, 'Failed to send OTP email. Please verify SMTP configuration or try again.');
        }

        return sendResponse(res, 200, 'Verification OTP sent to your email', {
            email: normalizedEmail,
            expiresInSeconds: 600
        });
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

export const registerOfficeAccount = async (req, res) => {
    try {
        const { email, password, otp } = req.body;

        if (!email || !password) {
            return sendError(res, 400, 'Email and password are required');
        }

        if (!otp) {
            return sendError(res, 400, 'OTP is required');
        }

        const normalizedEmail = email.toLowerCase().trim();

        const existingAccount = await OfficeAccount.findOne({ email: normalizedEmail });
        if (existingAccount) {
            return sendError(res, 400, 'Email already in use');
        }

        const otpRecord = await OfficeOtp.findOne({ email: normalizedEmail });
        if (!otpRecord || otpRecord.expiresAt < new Date()) {
            return sendError(res, 400, 'OTP has expired or was not requested. Please request a new OTP.');
        }

        if (otpRecord.otp !== String(otp).trim()) {
            otpRecord.attempts = (otpRecord.attempts || 0) + 1;
            if (otpRecord.attempts >= 5) {
                await OfficeOtp.deleteOne({ _id: otpRecord._id });
                return sendError(res, 400, 'Too many incorrect attempts. Please request a new OTP.');
            }
            await otpRecord.save();
            return sendError(res, 400, 'Invalid OTP. Please check your code.');
        }

        // OTP verified successfully, clean up
        await OfficeOtp.deleteOne({ _id: otpRecord._id });

        const newAccount = new OfficeAccount({ email: normalizedEmail, password });
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
