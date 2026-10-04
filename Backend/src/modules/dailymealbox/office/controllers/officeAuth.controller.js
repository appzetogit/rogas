import crypto from 'crypto';
import { signAccessToken } from '../../../../core/auth/token.util.js';
import { OfficeAccount } from '../models/officeAccount.model.js';
import { OfficeCompany } from '../models/officeCompany.model.js';
import { OfficeOnboarding } from '../models/officeOnboarding.model.js';
import { OfficeOtp } from '../models/officeOtp.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';
import { sendOfficeSignupOtpEmail, sendOfficeNotificationEmail } from '../../../../utils/email.js';
import { OfficePasswordReset } from '../models/officePasswordReset.model.js';

// The Office panel has no refresh-token flow, so its sign-in token is long-lived: it ends only when the user logs out.
const OFFICE_TOKEN_TTL = process.env.OFFICE_TOKEN_EXPIRES || '365d';
const generateToken = (account) => {
    return signAccessToken({ accountId: account._id, role: 'OFFICE_ADMIN' }, OFFICE_TOKEN_TTL);
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

// ─── Forgot password (email OTP) ─────────────────────────────────────────────
const hashOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** POST /office/auth/forgot-password { email } — always answers the same way, so it cannot be used to find accounts. */
export const requestOfficePasswordReset = async (req, res) => {
    try {
        const email = String(req.body?.email || '').toLowerCase().trim();
        if (!EMAIL_RE.test(email)) return sendError(res, 400, 'Please provide a valid email address');

        const generic = () => sendResponse(res, 200, 'If an account exists for this email, a reset code has been sent.', { expiresInSeconds: 600 });

        const account = await OfficeAccount.findOne({ email });
        if (!account || account.status === 'blocked') return generic();

        // Simple throttle: one code per 45 seconds per email.
        const existing = await OfficePasswordReset.findOne({ email });
        if (existing && Date.now() - new Date(existing.updatedAt).getTime() < 45 * 1000) return generic();

        const otp = String(crypto.randomInt(100000, 1000000));
        await OfficePasswordReset.findOneAndUpdate(
            { email },
            { otpHash: hashOtp(otp), expiresAt: new Date(Date.now() + 10 * 60 * 1000), attempts: 0 },
            { upsert: true, new: true }
        );
        await sendOfficeNotificationEmail({
            to: email,
            subject: `Your DailyMealBox password reset code: ${otp}`,
            heading: 'Reset your password',
            lines: ['Use this 6-digit code to reset your Office panel password. It expires in 10 minutes.', 'If you did not request this, you can ignore this email.'],
            code: otp
        });
        return generic();
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};

/** POST /office/auth/reset-password { email, otp, newPassword } */
export const resetOfficePassword = async (req, res) => {
    try {
        const email = String(req.body?.email || '').toLowerCase().trim();
        const otp = String(req.body?.otp || '').trim();
        const newPassword = String(req.body?.newPassword || '');
        if (!EMAIL_RE.test(email) || !otp) return sendError(res, 400, 'Email and code are required');
        if (newPassword.length < 8) return sendError(res, 400, 'Password must be at least 8 characters');

        const record = await OfficePasswordReset.findOne({ email });
        if (!record || record.expiresAt < new Date()) return sendError(res, 400, 'The code has expired. Please request a new one.');
        if (record.attempts >= 5) {
            await OfficePasswordReset.deleteOne({ _id: record._id });
            return sendError(res, 400, 'Too many incorrect attempts. Please request a new code.');
        }
        if (record.otpHash !== hashOtp(otp)) {
            record.attempts += 1;
            await record.save();
            return sendError(res, 400, 'Incorrect code. Please check and try again.');
        }

        const account = await OfficeAccount.findOne({ email });
        if (!account) return sendError(res, 400, 'The code has expired. Please request a new one.');
        account.password = newPassword; // hashed by the model's pre-save hook
        await account.save();
        await OfficePasswordReset.deleteOne({ _id: record._id });
        return sendResponse(res, 200, 'Password updated. You can now log in.');
    } catch (error) {
        return sendError(res, 500, error.message);
    }
};
