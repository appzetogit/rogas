import express from 'express';
import { registerOfficeAccount, loginOfficeAccount, sendOfficeOtp } from '../controllers/officeAuth.controller.js';

const router = express.Router();

router.post('/send-otp', sendOfficeOtp);
router.post('/register', registerOfficeAccount);
router.post('/login', loginOfficeAccount);

export default router;
