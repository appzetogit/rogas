import express from 'express';
import { getAllCustomerWalletsController } from '../controllers/adminWallet.controller.js';


const router = express.Router();

// Get all customer wallets
// Allowed for any ADMIN (SUPER_ADMIN, CUSTOMER_SERVICE logic handled by frontend or parent router)
router.get('/wallet-transactions', getAllCustomerWalletsController);

export default router;
