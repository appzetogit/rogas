import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { unconfirmShift } from '../../food/delivery/services/attendance.service.js';
import { reportFailedDelivery, DISPOSITIONS, REASONS } from './failedDelivery.service.js';
import { isEnabled } from '../platform/platformConfig.service.js';

/** Driver app endpoints added by Amendment v2 Extra. Mounted at /api/v1/dmb (paths start with /driver/). */
const router = express.Router();
const driver = [authMiddleware, requireRoles('DELIVERY_PARTNER')];
const did = (req) => req.user?.userId || req.user?._id;

const send = (fn) => async (req, res) => {
    try {
        res.json({ success: true, ...(await fn(req)) });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, code: err.code, message: err.message });
    }
};

/** GAP Z: is confirmation required for this driver (ACM-152)? */
router.get('/driver/shift-settings', ...driver, send(async (req) => {
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    const d = await FoodDeliveryPartner.findById(did(req)).select('zoneIds').lean();
    return { confirmationRequired: await isEnabled('driverShiftConfirmation', { zoneId: d?.zoneIds?.[0] }), unconfirmLockHours: 2 };
}));

router.post('/driver/shifts/:id/unconfirm', ...driver, send(async (req) => ({ shift: await unconfirmShift(did(req), req.params.id) })));

/** DA-07 failed delivery with disposition (Gap P). Body: { type: 'dmb'|'pantry', reason, disposition, photoUrl, note } */
router.get('/driver/failed-delivery-options', ...driver, send(async () => ({ reasons: REASONS, dispositions: DISPOSITIONS })));
router.post('/driver/stops/:id/fail', ...driver, send(async (req) => ({
    result: await reportFailedDelivery({ driverId: did(req), stopType: req.body?.type === 'pantry' ? 'pantry' : 'dmb', id: req.params.id, reason: req.body?.reason, disposition: req.body?.disposition, photoUrl: req.body?.photoUrl, note: req.body?.note })
})));

export default router;
