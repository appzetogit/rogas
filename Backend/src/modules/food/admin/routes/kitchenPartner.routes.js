import express from 'express';
import {
    createKitchenPartner,
    getKitchenPartners,
    updateKitchenPartnerStatus,
    updateKitchenPartner
} from '../controllers/kitchenPartner.controller.js';

const router = express.Router();

// Base route: /api/food/admin/kitchen-partners
router.post('/', createKitchenPartner);
router.get('/', getKitchenPartners);
router.patch('/:id/status', updateKitchenPartnerStatus);
router.patch('/:id', updateKitchenPartner);

export default router;
