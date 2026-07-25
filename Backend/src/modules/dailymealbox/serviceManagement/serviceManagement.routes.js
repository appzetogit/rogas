import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import * as svc from './serviceManagement.service.js';

const router = express.Router();

// ─── Delivery Partner Routes ─────────────────────────────────────────────────

router.post(
    '/delivery/unavailable',
    authMiddleware,
    requireRoles('DELIVERY_PARTNER'),
    async (req, res) => {
        try {
            const driverId = req.user.userId;
            const result = await svc.createDeliveryUnavailableRequest(driverId, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.get(
    '/delivery/my-requests',
    authMiddleware,
    requireRoles('DELIVERY_PARTNER'),
    async (req, res) => {
        try {
            const data = await svc.getDriverRequests(req.user.userId);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.get(
    '/delivery/ride-transfers',
    authMiddleware,
    requireRoles('DELIVERY_PARTNER'),
    async (req, res) => {
        try {
            const data = await svc.getDriverRideTransfers(req.user.userId);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/delivery/ride-transfers/:id/respond',
    authMiddleware,
    requireRoles('DELIVERY_PARTNER'),
    async (req, res) => {
        try {
            const { response } = req.body; // 'accepted' or 'rejected'
            if (!['accepted', 'rejected'].includes(response)) {
                return res.status(400).json({ success: false, message: 'Invalid response. Must be accepted or rejected.' });
            }
            const result = await svc.respondToRideTransfer(req.params.id, req.user.userId, response);
            res.json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

// ─── Vendor Routes ───────────────────────────────────────────────────────────

router.post(
    '/vendor/unavailable',
    authMiddleware,
    requireRoles('RESTAURANT'),
    async (req, res) => {
        try {
            const vendorId = req.user.userId;
            const result = await svc.createVendorUnavailableRequest(vendorId, req.body);
            res.status(201).json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.get(
    '/vendor/my-requests',
    authMiddleware,
    requireRoles('RESTAURANT'),
    async (req, res) => {
        try {
            const data = await svc.getVendorRequests(req.user.userId);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// ─── Customer Routes ─────────────────────────────────────────────────────────

router.get(
    '/customer/my-requests',
    authMiddleware,
    requireRoles('USER'),
    async (req, res) => {
        try {
            const data = await svc.getCustomerRequests(req.user.userId);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/customer/requests/:id/extend',
    authMiddleware,
    requireRoles('USER'),
    async (req, res) => {
        try {
            const result = await svc.handleCustomerExtend(req.params.id, req.user.userId);
            res.json({ success: true, data: result, message: 'Subscription extended by 1 day' });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/customer/requests/:id/refund',
    authMiddleware,
    requireRoles('USER'),
    async (req, res) => {
        try {
            const result = await svc.handleCustomerRefundRequest(req.params.id, req.user.userId);
            res.json({ success: true, data: result, message: 'Refund request submitted for admin approval' });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

// ─── Admin Routes ────────────────────────────────────────────────────────────

// Delivery Service Admin
router.get(
    '/admin/delivery-requests',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const data = await svc.getDeliveryRequests(req.query);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/admin/delivery-requests/:id/approve',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const result = await svc.approveDeliveryRequest(req.params.id, req.user.userId);
            res.json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/admin/delivery-requests/:id/reject',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const result = await svc.rejectDeliveryRequest(req.params.id, req.user.userId, req.body.notes);
            res.json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.post(
    '/admin/delivery-requests/:id/assign-rides',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const { assignments } = req.body; // [{ driverId, orderCount }]
            if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
                return res.status(400).json({ success: false, message: 'Assignments array is required' });
            }
            const result = await svc.assignRideTransfers(req.params.id, assignments, req.user.userId);
            res.json({ success: true, data: result, message: `${result.length} ride transfer(s) created` });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.get(
    '/admin/available-drivers',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const data = await svc.getAvailableDrivers(req.query);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

// Vendor Service Admin
router.get(
    '/admin/vendor-requests',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const data = await svc.getVendorRequestsAdmin(req.query);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/admin/vendor-requests/:id/approve',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const result = await svc.approveVendorRequest(req.params.id, req.user.userId);
            res.json({
                success: true,
                data: result.request,
                customerRequestsCreated: result.customerRequestsCreated,
                message: `Approved. ${result.customerRequestsCreated} customer request(s) created.`
            });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/admin/vendor-requests/:id/reject',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const result = await svc.rejectVendorRequest(req.params.id, req.user.userId, req.body.notes);
            res.json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

// Customer Service Admin
router.get(
    '/admin/customer-requests',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const data = await svc.getCustomerRequestsAdmin(req.query);
            res.json({ success: true, data });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/admin/customer-requests/:id/approve-refund',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const result = await svc.approveCustomerRefund(req.params.id, req.user.userId);
            res.json({ success: true, data: result, message: 'Refund approved and wallet credited' });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

router.patch(
    '/admin/customer-requests/:id/reject-refund',
    authMiddleware,
    requireRoles('ADMIN'),
    async (req, res) => {
        try {
            const result = await svc.rejectCustomerRefund(req.params.id, req.user.userId, req.body.notes);
            res.json({ success: true, data: result });
        } catch (err) {
            res.status(400).json({ success: false, message: err.message });
        }
    }
);

export default router;
