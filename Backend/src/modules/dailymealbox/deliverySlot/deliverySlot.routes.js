import express from 'express';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { invalidateCache } from '../../../middleware/cache.js';
import * as slotService from './deliverySlot.service.js';

const wrap = (fn, { invalidate = false } = {}) => async (req, res) => {
    try {
        const data = await fn(req);
        if (invalidate) await invalidateCache('vendor_timings:*');
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, message: err.message, usage: err.usage });
    }
};

// Every slot is returned, disabled ones included, so that orders and subscriptions placed on a
// slot the admin later switched off still resolve to a name. Clients offer only isEnabled ones.
export const publicSlotRouter = express.Router();
publicSlotRouter.get('/', wrap(async (req) => {
    const { cityIdForZone, getControl } = await import('../platform/platformConfig.service.js');
    const zoneId = req.query.zoneId || req.zoneId;
    const cityId = await cityIdForZone(zoneId);
    const weekend = await getControl('weekendDelivery', { cityId });
    const [all, offered] = await Promise.all([slotService.listSlots(), slotService.offeredSlots({ cityId, weekend })]);
    const offeredByKey = new Map(offered.map((s) => [s.key, s]));
    // `offered` = may be chosen by a new subscriber here; `offeredDays` = weekdays it can be chosen for.
    return {
        slots: all.map((s) => ({
            ...s,
            offered: offeredByKey.has(s.key),
            offeredDays: offeredByKey.get(s.key)?.availableDays || []
        }))
    };
}));

/** Admin CRUD. Mounted inside admin.routes.js at /delivery-slots (after requireAdmin). */
export const adminSlotRouter = express.Router();
adminSlotRouter.get('/', requirePermission('vendorManagement', 'view'), wrap(async () => ({ slots: await slotService.listSlots() })));
adminSlotRouter.get('/:id/usage', requirePermission('vendorManagement', 'view'), wrap(async (req) => {
    const { DeliverySlot } = await import('./deliverySlot.model.js');
    const slot = await DeliverySlot.findById(req.params.id).lean();
    if (!slot) throw new Error('Delivery slot not found');
    return { usage: await slotService.getSlotUsage(slot.key) };
}));
adminSlotRouter.post('/', requirePermission('vendorManagement', 'create'), wrap(async (req) => ({ slot: await slotService.createSlot(req.body || {}) }), { invalidate: true }));
adminSlotRouter.put('/:id', requirePermission('vendorManagement', 'edit'), wrap(async (req) => ({ slot: await slotService.updateSlot(req.params.id, req.body || {}) }), { invalidate: true }));
adminSlotRouter.delete('/:id', requirePermission('vendorManagement', 'delete'), wrap(async (req) => slotService.deleteSlot(req.params.id), { invalidate: true }));
adminSlotRouter.get('/:id/coverage', requirePermission('vendorManagement', 'view'), wrap(async (req) => {
    const { DeliverySlot } = await import('./deliverySlot.model.js');
    const slot = await DeliverySlot.findById(req.params.id).lean();
    if (!slot) throw new Error('Delivery slot not found');
    return { coverage: await slotService.shiftCoverage(slot), usage: await slotService.getSlotUsage(slot.key) };
}));
const audit = async (req, action, slot, extra = {}) => {
    try {
        const { writeAudit } = await import('../../food/admin/services/prdAdmin.service.js');
        await writeAudit(req, action, 'DeliverySlot', slot?._id, null, { key: slot?.key, status: slot?.status, ...extra }, req.body?.reason || '');
    } catch { /* audit is best-effort */ }
};
adminSlotRouter.post('/:id/activate', requirePermission('vendorManagement', 'edit'), wrap(async (req) => {
    const out = await slotService.activateSlot(req.params.id);
    await audit(req, 'slot.activate', out.slot, { drivers: out.coverage?.drivers });
    return out;
}, { invalidate: true }));
adminSlotRouter.post('/:id/deactivate', requirePermission('vendorManagement', 'edit'), wrap(async (req) => {
    const out = await slotService.deactivateSlot(req.params.id, { graceDays: req.body?.graceDays, fallbackSlotKey: req.body?.fallbackSlotKey });
    await audit(req, 'slot.deactivate', out.slot, { affectedSubscriptions: out.affected, graceEndsAt: out.slot?.graceEndsAt, fallback: out.slot?.fallbackSlotKey });
    return out;
}, { invalidate: true }));
