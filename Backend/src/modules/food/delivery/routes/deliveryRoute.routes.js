/**
 * deliveryRoute.routes.js
 *
 * Express router for the VRP route optimization feature.
 * Mounted in src/routes/index.js at /v1/food/delivery/route.
 *
 * All endpoints require DELIVERY_PARTNER authentication.
 */

import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
    getMyRouteController,
    recalculateMyRouteController
} from '../controllers/deliveryRoute.controller.js';

const router = express.Router();

// GET /food/delivery/route — fetch current stored route
router.get(
    '/',
    authMiddleware,
    requireRoles('DELIVERY_PARTNER'),
    getMyRouteController
);

// POST /food/delivery/route/recalculate — trigger fresh VRP computation
router.post(
    '/recalculate',
    authMiddleware,
    requireRoles('DELIVERY_PARTNER'),
    recalculateMyRouteController
);

export default router;
