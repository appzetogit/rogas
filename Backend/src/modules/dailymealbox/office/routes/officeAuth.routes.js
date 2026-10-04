import express from 'express';
import { registerOfficeAccount, loginOfficeAccount, sendOfficeOtp, requestOfficePasswordReset, resetOfficePassword } from '../controllers/officeAuth.controller.js';

const router = express.Router();

router.post('/send-otp', sendOfficeOtp);
router.post('/register', registerOfficeAccount);
router.post('/login', loginOfficeAccount);
router.post('/forgot-password', requestOfficePasswordReset);
router.post('/reset-password', resetOfficePassword);

export default router;
