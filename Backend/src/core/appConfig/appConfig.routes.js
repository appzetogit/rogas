import express from 'express';
import { getAppConfigs, getAppConfigByName, updateAppConfig, getSlotTimings } from './appConfig.controller.js';
import { authMiddleware } from '../auth/auth.middleware.js';
import { requireRoles } from '../roles/role.middleware.js';

const router = express.Router();

// Public route — slot timings (no auth needed, used by customer app)
router.get('/slot-timings', getSlotTimings);

// Public route to fetch configuration for client apps
router.get('/:appName', getAppConfigByName);

// Admin routes
router.get('/', authMiddleware, requireRoles('ADMIN'), getAppConfigs);
router.put('/:appName', authMiddleware, requireRoles('ADMIN'), updateAppConfig);

export default router;
