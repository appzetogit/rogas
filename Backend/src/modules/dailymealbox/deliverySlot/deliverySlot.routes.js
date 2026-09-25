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
publicSlotRouter.get('/', wrap(async () => ({ slots: await slotService.listSlots() })));

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
