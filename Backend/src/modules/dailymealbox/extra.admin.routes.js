import express from 'express';
import { adminPlatformRouter } from './platform/platform.routes.js';
import adminAmendmentRoutes from './admin/amendment.admin.routes.js';

/** Amendment v2 Extra — admin endpoints. Mounted at /api/v1/food/admin/dmb (admin auth already applied). */
const router = express.Router();
router.use(adminPlatformRouter);
router.use(adminAmendmentRoutes);

export default router;
