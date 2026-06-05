import express from 'express';
import {
  createPromocode,
  getRestaurantPromocodes,
  togglePromocodeStatus,
  deletePromocode,
  getActivePromocodes,
  validatePromocode
} from '../controllers/promocodeController.js';
import { authMiddleware } from '../core/auth/auth.middleware.js';
import { requireRoles } from '../core/roles/role.middleware.js';

const router = express.Router();

// User Routes (Public or protected by user auth if needed, but keeping public so guests can see offers)
router.get('/restaurant/:restaurantId', getActivePromocodes);
router.post('/validate', validatePromocode);

// Restaurant Protected Routes
router.use(authMiddleware, requireRoles('RESTAURANT', 'ADMIN'));

router.route('/')
  .get(getRestaurantPromocodes)
  .post(createPromocode);

router.route('/:id')
  .patch(togglePromocodeStatus)
  .delete(deletePromocode);

export default router;
