import express from 'express';
import { registerOfficeAccount, loginOfficeAccount } from '../controllers/officeAuth.controller.js';

const router = express.Router();

router.post('/register', registerOfficeAccount);
router.post('/login', loginOfficeAccount);

export default router;
