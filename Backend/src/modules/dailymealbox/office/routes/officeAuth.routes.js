import express from 'express';
import { registerOfficeAccount, loginOfficeAccount, sendOfficeOtp, requestOfficePasswordReset, resetOfficePassword } from '../controllers/officeAuth.controller.js';
import { authRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

router.post('/send-otp', authRateLimiter, sendOfficeOtp);
router.post('/register', authRateLimiter, registerOfficeAccount);
router.post('/login', authRateLimiter, loginOfficeAccount);
router.post('/forgot-password', authRateLimiter, requestOfficePasswordReset);
router.post('/reset-password', authRateLimiter, resetOfficePassword);

export default router;
