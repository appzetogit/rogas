import mongoose from 'mongoose';
import { AdminComplaint } from '../../admin/models/complaint.model.js';
import { sendError, sendResponse } from '../../../../utils/response.js';

const ALLOWED_CATEGORIES = ['orders', 'payments', 'menu', 'restaurant', 'technical', 'other'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
const ALLOWED_STATUSES = ['open', 'in_review', 'resolved', 'escalated', 'closed'];

export const createRestaurantSupportTicketController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const body = req.body || {};
        const category = String(body.category || 'other').trim().toLowerCase();
        const subject = String(body.subject || body.issueType || '').trim();
        const description = String(body.description || body.message || '').trim();
        const orderRef = String(body.orderRef || body.orderId || '').trim();
        const priority = String(body.priority || 'medium').trim().toLowerCase();
        const proofPhotos = Array.isArray(body.proofPhotos) ? body.proofPhotos : (body.image ? [body.image] : []);

        if (!ALLOWED_CATEGORIES.includes(category)) {
            return sendError(res, 400, 'Invalid category');
        }
        if (!subject) {
            return sendError(res, 400, 'Subject is required');
        }
        if (!description) {
            return sendError(res, 400, 'Description is required');
        }
        if (!ALLOWED_PRIORITIES.includes(priority)) {
            return sendError(res, 400, 'Invalid priority');
        }

        // Try to match orderId if orderRef is a valid ObjectId
        let orderId = null;
        if (mongoose.Types.ObjectId.isValid(orderRef)) {
            orderId = new mongoose.Types.ObjectId(orderRef);
        }

        const autoEscalateAt = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours auto-escalate

        const created = await AdminComplaint.create({
            vendorId: new mongoose.Types.ObjectId(restaurantId),
            customerId: null,
            complainantType: 'vendor',
            subject,
            message: description,
            orderId,
            proofPhotos,
            category,
            priority,
            status: 'open',
            autoEscalateAt,
            statusTrail: [{
                status: 'open',
                changedByName: 'Vendor',
                note: 'Complaint created via Vendor Panel',
                at: new Date()
            }]
        });

        // Try to populate and emit socket events for real-time inbox
        let populated = null;
        try {
            populated = await AdminComplaint.findById(created._id)
                .populate('vendorId', 'restaurantName ownerName ownerPhone')
                .lean();
        } catch (popErr) {
            console.error('Failed to populate vendor complaint details:', popErr);
        }

        try {
            const { getIO } = await import('../../../../config/socket.js');
            const io = getIO();
            if (io && populated) {
                io.to('admin').emit('new_complaint', populated);
                io.to('admin').emit('play_notification_sound', { type: 'complaint' });
            }
        } catch (socketErr) {
            console.error('Failed to emit vendor complaint socket event:', socketErr);
        }

        return sendResponse(res, 201, 'Support ticket created successfully', {
            ticket: {
                _id: created._id,
                ticketId: created.complaintRef,
                subject: created.subject,
                description: created.message,
                category: created.category,
                priority: created.priority,
                status: created.status,
                proofPhotos: created.proofPhotos,
                createdAt: created.createdAt,
                updatedAt: created.updatedAt
            }
        });
    } catch (error) {
        next(error);
    }
};

export const listRestaurantSupportTicketsController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const limit = Math.min(Math.max(parseInt(req.query?.limit, 10) || 20, 1), 100);
        const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
        const skip = (page - 1) * limit;

        const filter = { 
            vendorId: new mongoose.Types.ObjectId(restaurantId),
            complainantType: 'vendor'
        };

        const status = String(req.query?.status || '').trim().toLowerCase();
        if (ALLOWED_STATUSES.includes(status)) {
            filter.status = status;
        }

        const searchText = String(req.query?.search || '').trim();
        if (searchText) {
            const rx = new RegExp(searchText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
            filter.$or = [
                { subject: rx },
                { message: rx }
            ];
        }

        const [tickets, total] = await Promise.all([
            AdminComplaint.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AdminComplaint.countDocuments(filter)
        ]);

        const mappedTickets = tickets.map(c => ({
            _id: c._id,
            ticketId: c.complaintRef,
            subject: c.subject,
            description: c.message,
            category: c.category,
            priority: c.priority || 'medium',
            status: c.status,
            adminResponse: c.customerResponseMessage || '',
            respondedAt: c.customerResponseAt || null,
            proofPhotos: c.proofPhotos || [],
            createdAt: c.createdAt,
            updatedAt: c.updatedAt
        }));

        return sendResponse(res, 200, 'Support tickets fetched successfully', {
            tickets: mappedTickets,
            total,
            page,
            limit
        });
    } catch (error) {
        next(error);
    }
};

export const getRestaurantSupportTicketByIdController = async (req, res, next) => {
    try {
        const restaurantId = req.user?.userId;
        if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) {
            return sendError(res, 401, 'Unauthorized');
        }

        const ticketId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(ticketId)) {
            return sendError(res, 400, 'Invalid ticket ID');
        }

        const ticket = await AdminComplaint.findOne({
            _id: new mongoose.Types.ObjectId(ticketId),
            vendorId: new mongoose.Types.ObjectId(restaurantId),
            complainantType: 'vendor'
        }).lean();

        if (!ticket) {
            return sendError(res, 404, 'Support ticket not found');
        }

        return sendResponse(res, 200, 'Support ticket fetched successfully', {
            ticket: {
                _id: ticket._id,
                ticketId: ticket.complaintRef,
                subject: ticket.subject,
                description: ticket.message,
                category: ticket.category,
                priority: ticket.priority || 'medium',
                status: ticket.status,
                adminResponse: ticket.customerResponseMessage || '',
                respondedAt: ticket.customerResponseAt || null,
                proofPhotos: ticket.proofPhotos || [],
                createdAt: ticket.createdAt,
                updatedAt: ticket.updatedAt
            }
        });
    } catch (error) {
        next(error);
    }
};
