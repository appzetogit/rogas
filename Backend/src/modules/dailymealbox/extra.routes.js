import express from 'express';
import customerRoutes from './customer/customer.routes.js';
import vendorExtraRoutes from './vendor/vendorExtra.routes.js';
import driverExtraRoutes from './tracking/driverExtra.routes.js';

/**
 * Amendment v2 Extra — app-facing endpoints (customer, vendor, driver). Mounted at /api/v1/dmb after the original
 * DailyMealBox routers, so only paths those routers do not handle reach here. Each route applies its own auth.
 */
const router = express.Router();
router.use(customerRoutes);
router.use(vendorExtraRoutes);
router.use(driverExtraRoutes);

export default router;
