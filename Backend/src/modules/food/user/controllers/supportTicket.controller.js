import mongoose from 'mongoose';
import { AdminComplaint } from '../../admin/models/complaint.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

const categoryMap = {
    'Delivery Delay': 'late_delivery',
    'Missing / Wrong Items': 'missing_item',
    'Food Quality Issue': 'quality',
    'Payment / Billing Issue': 'payment',
    'App Bug / Tech Support': 'other',
    'Other': 'other'
};

export async function createSupportTicketController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const body = req.body || {};
        const type = String(body.type || '').trim();
        const issueType = String(body.issueType || '').trim();
        const description = String(body.description || '').trim();
        const image = String(body.image || '').trim();

        if (!['order', 'restaurant', 'other'].includes(type)) {
            return sendError(res, 400, 'Invalid ticket type');
        }
        if (!issueType) return sendError(res, 400, 'issueType required');
        if (!description) return sendError(res, 400, 'description required');

        const autoEscalateAt = new Date(Date.now() + 4 * 60 * 60 * 1000);
        const doc = {
            customerId: new mongoose.Types.ObjectId(userId),
            subject: issueType,
            message: description,
            proofPhotos: image ? [image] : [],
            category: categoryMap[issueType] || 'other',
            autoEscalateAt,
            status: 'open',
            statusTrail: [{
                status: 'open',
                changedByName: 'Customer',
                note: 'Complaint created via Customer Panel',
                at: new Date()
            }]
        };

        if (type === 'order') {
            if (!body.orderId || !mongoose.Types.ObjectId.isValid(body.orderId)) {
                return sendError(res, 400, 'orderId required');
            }
            const orderMongoId = new mongoose.Types.ObjectId(body.orderId);
            doc.orderId = orderMongoId;
            const { FoodOrder } = await import('../../orders/models/order.model.js');
            const order = await FoodOrder.findById(orderMongoId).lean();
            if (order) {
                doc.vendorId = order.restaurantId;
                doc.driverId = order.dispatch?.deliveryPartnerId || null;
                doc.city = order.deliveryAddress?.city || '';
            }
        }

        if (type === 'restaurant') {
            if (!body.restaurantId || !mongoose.Types.ObjectId.isValid(body.restaurantId)) {
                return sendError(res, 400, 'restaurantId required');
            }
            doc.vendorId = new mongoose.Types.ObjectId(body.restaurantId);
        }

        const created = await AdminComplaint.create(doc);

        let populated = null;
        try {
            populated = await AdminComplaint.findById(created._id)
                .populate('customerId', 'name phone email')
                .populate('vendorId', 'restaurantName')
                .populate('driverId', 'name phone')
                .lean();
        } catch (popErr) {
            console.error('Failed to populate complaint details:', popErr);
        }

        // Emit Socket event to admin room for real-time update
        try {
            const { getIO } = await import('../../../../config/socket.js');
            const io = getIO();
            if (io && populated) {
                io.to('admin').emit('new_complaint', populated);
                io.to('admin').emit('play_notification_sound', { type: 'complaint' });
            }
        } catch (socketErr) {
            console.error('Failed to emit complaint socket event:', socketErr);
        }

        const formattedTicket = {
            _id: created._id,
            issueType: created.subject || 'Other',
            description: created.message || '',
            orderId: created.orderId || null,
            image: created.proofPhotos && created.proofPhotos.length > 0 ? created.proofPhotos[0] : '',
            adminResponse: created.customerResponseMessage || '',
            status: created.status,
            createdAt: created.createdAt,
            updatedAt: created.updatedAt
        };

        return sendResponse(res, 201, 'Ticket created', { ticket: formattedTicket });
    } catch (e) {
        next(e);
    }
}

export async function listMySupportTicketsController(req, res, next) {
    try {
        const userId = req.user?.userId;
        const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 50);
        const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        const [complaints, total] = await Promise.all([
            AdminComplaint.find({ customerId: new mongoose.Types.ObjectId(userId) })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AdminComplaint.countDocuments({ customerId: new mongoose.Types.ObjectId(userId) })
        ]);

        const tickets = complaints.map(c => ({
            _id: c._id,
            issueType: c.subject || 'Other',
            description: c.message || '',
            orderId: c.orderId || null,
            image: c.proofPhotos && c.proofPhotos.length > 0 ? c.proofPhotos[0] : '',
            adminResponse: c.customerResponseMessage || '',
            status: c.status,
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
        }));

        return sendResponse(res, 200, 'Tickets fetched', { tickets, total, page, limit });
    } catch (e) {
        next(e);
    }
}
