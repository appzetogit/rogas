import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { unconfirmShift, declineShift } from '../../food/delivery/services/attendance.service.js';
import { reportFailedDelivery, DISPOSITIONS, REASONS } from './failedDelivery.service.js';

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

/** Shift rules the driver app needs: how long before a shift start an accepted shift can still be withdrawn. */
router.get('/driver/shift-settings', ...driver, send(async () => ({ unconfirmLockHours: 2 })));

/** The driver declines a pending assignment. Body: { reason } */
router.post('/driver/shifts/:id/decline', ...driver, send(async (req) => ({ shift: await declineShift(did(req), req.params.id, { reason: req.body?.reason }) })));

router.post('/driver/shifts/:id/unconfirm', ...driver, send(async (req) => ({ shift: await unconfirmShift(did(req), req.params.id, new Date(), { reason: req.body?.reason }) })));

/** DA-03: the promotions that apply to this driver, each with this week's progress (the home-screen bars). */
router.get('/driver/promotions', ...driver, send(async (req) => {
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    const { promotionsForDriver } = await import('../delivery/driverEarnings.service.js');
    const me = await FoodDeliveryPartner.findById(did(req)).select('zoneIds').lean();
    return { promotions: await promotionsForDriver({ driverId: did(req), zoneIds: (me?.zoneIds || []).map(String) }) };
}));

/** Hub hand-overs: what this driver has to drop at a hub or collect from one. */
router.get('/driver/hub-tasks', ...driver, send(async (req) => {
    const { driverHubTasks } = await import('../delivery/hub.service.js');
    return { tasks: await driverHubTasks({ driverId: did(req) }) };
}));
/** PIN 1: the source driver hands an item to the hub. Body: { pin } */
router.post('/driver/hub/:id/drop', ...driver, send(async (req) => {
    const { dropAtHub } = await import('../delivery/hub.service.js');
    const result = await dropAtHub({ transferId: req.params.id, driverId: did(req), pin: req.body?.pin });
    (await import('../subscription/dmb.dailyOrder.service.js')).notifyDriverOfRouteUpdate(did(req));
    return { result };
}));
/** PIN 2: the zone driver collects an item at the hub. Body: { pin } */
router.post('/driver/hub/:id/pickup', ...driver, send(async (req) => {
    const { pickupAtHub } = await import('../delivery/hub.service.js');
    return { result: await pickupAtHub({ transferId: req.params.id, driverId: did(req), pin: req.body?.pin }) };
}));

/** DA-07 failed delivery with disposition (Gap P). Body: { type: 'dmb'|'pantry', reason, disposition, photoUrl, note } */
router.get('/driver/failed-delivery-options', ...driver, send(async () => ({ reasons: REASONS, dispositions: DISPOSITIONS })));
router.post('/driver/stops/:id/fail', ...driver, send(async (req) => ({
    result: await reportFailedDelivery({ driverId: did(req), stopType: req.body?.type === 'pantry' ? 'pantry' : 'dmb', id: req.params.id, reason: req.body?.reason, disposition: req.body?.disposition, photoUrl: req.body?.photoUrl, note: req.body?.note })
})));

export default router;
