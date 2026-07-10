import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { AdminComplaint } from '../models/complaint.model.js';
import { FleetInvoice } from '../models/fleetInvoice.model.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { FoodUser } from '../../../../core/users/user.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FleetPartner } from '../../../dailymealbox/vendor/fleetPartner.model.js';
import { writeAudit } from './prdAdmin.service.js';

const objectIdOrNull = (v) =>
    v && mongoose.Types.ObjectId.isValid(v) ? new mongoose.Types.ObjectId(v) : null;

// ─────────────────────────────────────────────────────────────────────────────
// AP-04  Complaint Management
// ─────────────────────────────────────────────────────────────────────────────

export async function listComplaints(query = {}) {
    // Migrate legacy support tickets to complaints once
    try {
        const { FoodSupportTicket } = await import('../../user/models/supportTicket.model.js');
        const legacyTickets = await FoodSupportTicket.find({}).lean();
        for (const ticket of legacyTickets) {
            const exists = await AdminComplaint.findOne({
                $or: [
                    { legacyTicketId: ticket._id },
                    { customerId: ticket.userId, createdAt: ticket.createdAt }
                ]
            });
            if (!exists) {
                const categoryMap = {
                    'Delivery Delay': 'late_delivery',
                    'Missing / Wrong Items': 'missing_item',
                    'Food Quality Issue': 'quality',
                    'Payment / Billing Issue': 'payment',
                    'App Bug / Tech Support': 'other',
                    'Other': 'other'
                };
                let vendorId = ticket.restaurantId || null;
                let driverId = null;
                let city = '';
                if (ticket.orderId) {
                    const { FoodOrder } = await import('../../orders/models/order.model.js');
                    const order = await FoodOrder.findById(ticket.orderId).lean();
                    if (order) {
                        vendorId = order.restaurantId || vendorId;
                        driverId = order.dispatch?.deliveryPartnerId || null;
                        city = order.deliveryAddress?.city || '';
                    }
                }
                let status = 'open';
                if (['in-review', 'in-progress', 'escalated'].includes(ticket.status)) status = 'in_review';
                if (ticket.status === 'resolved') status = 'resolved';

                await AdminComplaint.create({
                    customerId: ticket.userId,
                    orderId: ticket.orderId || null,
                    vendorId,
                    driverId,
                    subject: ticket.issueType || 'Other',
                    message: ticket.description || '',
                    proofPhotos: ticket.image ? [ticket.image] : [],
                    category: categoryMap[ticket.issueType] || 'other',
                    status,
                    city,
                    customerResponseSent: !!ticket.adminResponse,
                    customerResponseMessage: ticket.adminResponse || '',
                    customerResponseAt: ticket.adminResponse ? ticket.updatedAt : null,
                    createdAt: ticket.createdAt,
                    updatedAt: ticket.updatedAt,
                    statusTrail: [{
                        status: 'open',
                        changedByName: 'Customer',
                        note: 'Complaint imported from legacy support ticket',
                        at: ticket.createdAt
                    }],
                    legacyTicketId: ticket._id
                });
            }
        }
    } catch (migErr) {
        console.error('Error migrating support tickets to complaints:', migErr);
    }

    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = {};
    if (query.status) filter.status = String(query.status).trim();
    if (query.city) filter.city = String(query.city).trim();
    if (query.complainantType) filter.complainantType = String(query.complainantType).trim();
    if (query.vendorId && objectIdOrNull(query.vendorId)) filter.vendorId = objectIdOrNull(query.vendorId);
    if (query.driverId && objectIdOrNull(query.driverId)) filter.driverId = objectIdOrNull(query.driverId);
    if (query.customerId && objectIdOrNull(query.customerId)) filter.customerId = objectIdOrNull(query.customerId);
    if (query.category) filter.category = String(query.category).trim();
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) filter.createdAt.$lte = new Date(query.to);
    }
    if (query.search) {
        filter.$or = [
            { complaintRef: { $regex: query.search, $options: 'i' } },
            { subject: { $regex: query.search, $options: 'i' } }
        ];
    }
    const [complaints, total] = await Promise.all([
        AdminComplaint.find(filter)
            .populate('customerId', 'name phone email')
            .populate('vendorId', 'restaurantName ownerName ownerPhone primaryContactNumber')
            .populate('driverId', 'name phone')
            .populate('assignedAgentId', 'name email adminRole')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        AdminComplaint.countDocuments(filter)
    ]);
    const counts = await AdminComplaint.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);
    const statusCounts = counts.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {});
    return { complaints, total, page, limit, statusCounts };
}

export async function getComplaintById(id) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid complaint id');
    const complaint = await AdminComplaint.findById(id)
        .populate('customerId', 'name phone email walletBalance subscriptionStatus')
        .populate('vendorId', 'restaurantName ownerName ownerPhone primaryContactNumber logo city')
        .populate('driverId', 'name phone vehicleType')
        .populate('orderId', 'orderId orderStatus totalAmount createdAt deliveryAddress meals')
        .populate('assignedAgentId', 'name email adminRole')
        .populate('statusTrail.changedBy', 'name email')
        .lean();
    if (!complaint) return null;
    return complaint;
}

export async function createComplaint(body = {}, req) {
    const orderId = objectIdOrNull(body.orderId);
    const customerId = objectIdOrNull(body.customerId);
    if (!orderId || !customerId) throw new ValidationError('orderId and customerId are required');
    const order = await FoodOrder.findById(orderId).lean();
    if (!order) throw new ValidationError('Order not found');

    // Auto-set auto-escalation time (4 hours from now)
    const autoEscalateAt = new Date(Date.now() + 4 * 60 * 60 * 1000);

    const complaint = await AdminComplaint.create({
        orderId,
        customerId,
        vendorId: objectIdOrNull(body.vendorId) || order.restaurantId,
        driverId: objectIdOrNull(body.driverId) || order.deliveryPartnerId || null,
        subject: String(body.subject || '').trim(),
        message: String(body.message || '').trim(),
        proofPhotos: Array.isArray(body.proofPhotos) ? body.proofPhotos : [],
        category: body.category || 'other',
        city: body.city || order.city || '',
        autoEscalateAt,
        statusTrail: [{
            status: 'open',
            changedBy: objectIdOrNull(req?.user?.userId),
            changedByName: req?.adminProfile?.name || 'System',
            note: 'Complaint created',
            at: new Date()
        }]
    });
    await writeAudit(req, 'complaint.create', 'AdminComplaint', complaint._id, null, complaint.toObject());
    return complaint.toObject();
}

export async function updateComplaintStatus(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid complaint id');
    const complaint = await AdminComplaint.findById(id);
    if (!complaint) return null;
    const newStatus = String(body.status || '').trim();
    if (!['open', 'in_review', 'resolved', 'escalated'].includes(newStatus)) {
        throw new ValidationError('Invalid complaint status');
    }
    const before = complaint.toObject();
    complaint.status = newStatus;
    if (newStatus === 'resolved') complaint.resolvedAt = new Date();
    if (newStatus === 'in_review') {
        // Extend auto-escalation to 24h from now
        complaint.autoEscalateAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }
    if (body.agentId && objectIdOrNull(body.agentId)) {
        complaint.assignedAgentId = objectIdOrNull(body.agentId);
        complaint.assignedAgentName = body.agentName || '';
    }
    complaint.statusTrail.push({
        status: newStatus,
        changedBy: objectIdOrNull(req?.user?.userId),
        changedByName: req?.adminProfile?.name || '',
        note: body.note || '',
        at: new Date()
    });
    await complaint.save();
    try {
        const { getIO } = await import('../../../../config/socket.js');
        const io = getIO();
        if (io) {
            const driverIdStr = complaint.driverId?.toString();
            if (complaint.complainantType === 'delivery_partner' && driverIdStr) {
                io.to(`delivery:${driverIdStr}`).emit('complaint_status_updated', {
                    complaintId: complaint._id,
                    status: complaint.status === 'in_review' || complaint.status === 'escalated' ? 'in_progress' : complaint.status,
                    adminResponse: complaint.customerResponseMessage || '',
                    respondedAt: complaint.customerResponseAt || null,
                    updatedAt: complaint.updatedAt
                });
            }
            const vendorIdStr = complaint.vendorId?.toString();
            if (complaint.complainantType === 'vendor' && vendorIdStr) {
                io.to(`restaurant:${vendorIdStr}`).emit('complaint_status_updated', {
                    complaintId: complaint._id,
                    status: complaint.status,
                    adminResponse: complaint.customerResponseMessage || '',
                    respondedAt: complaint.customerResponseAt || null,
                    updatedAt: complaint.updatedAt
                });
            }
        }
    } catch (socketErr) {
        console.error('Failed to emit complaint status update socket event:', socketErr);
    }
    await writeAudit(req, `complaint.status.${newStatus}`, 'AdminComplaint', complaint._id, before, complaint.toObject(), body.note);
    return complaint.toObject();
}

export async function issueComplaintRefund(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid complaint id');
    const complaint = await AdminComplaint.findById(id);
    if (!complaint) return null;
    const adminProfile = await FoodAdmin.findById(req?.user?.userId).lean();
    const adminRole = adminProfile?.adminRole || 'SUPER_ADMIN';
    const refundAmount = Number(body.refundAmount || 0);

    // CS refund limit enforcement (150 PLN default)
    if (adminRole === 'CUSTOMER_SERVICE' && refundAmount > complaint.csRefundLimit) {
        throw new ValidationError(`CS agents can only issue refunds up to ${complaint.csRefundLimit} PLN. Escalate to Super Admin for larger refunds.`);
    }
    if (refundAmount <= 0) throw new ValidationError('Refund amount must be positive');

    const before = complaint.toObject();
    const refundType = body.refundType === 'full' ? 'full' : 'partial';
    const vatRate = 0.08; // 8% VAT example
    const vatAmount = Math.round(refundAmount * vatRate * 100) / 100;

    complaint.refundType = refundType;
    complaint.refundAmount = refundAmount;
    complaint.refundStatus = 'processed';
    complaint.refundSplit = {
        vendorClawback: Math.round(refundAmount * 0.7 * 100) / 100,
        fleetClawback: Math.round(refundAmount * 0.15 * 100) / 100,
        commissionReturn: Math.round(refundAmount * 0.15 * 100) / 100,
        vatAmount,
        totalRefund: refundAmount,
        currency: 'PLN',
        processedAt: new Date()
    };
    complaint.status = 'resolved';
    complaint.resolvedAt = new Date();
    complaint.statusTrail.push({
        status: 'resolved',
        changedBy: objectIdOrNull(req?.user?.userId),
        changedByName: req?.adminProfile?.name || '',
        note: `${refundType} refund of ${refundAmount} PLN issued`,
        at: new Date()
    });
    await complaint.save();
    await writeAudit(req, 'complaint.refund.issue', 'AdminComplaint', complaint._id, before, complaint.toObject(), `Refund: ${refundAmount} PLN`);
    return complaint.toObject();
}

export async function escalateComplaint(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid complaint id');
    const complaint = await AdminComplaint.findById(id);
    if (!complaint) return null;
    const before = complaint.toObject();
    // Find a Super Admin to escalate to
    const superAdmin = await FoodAdmin.findOne({ adminRole: 'SUPER_ADMIN', isActive: true }).select('_id name').lean();
    complaint.status = 'escalated';
    complaint.escalatedToId = superAdmin?._id || null;
    complaint.statusTrail.push({
        status: 'escalated',
        changedBy: objectIdOrNull(req?.user?.userId),
        changedByName: req?.adminProfile?.name || '',
        note: body.reason || 'Escalated to Super Admin',
        at: new Date()
    });
    await complaint.save();
    await writeAudit(req, 'complaint.escalate', 'AdminComplaint', complaint._id, before, complaint.toObject(), body.reason);
    return complaint.toObject();
}

export async function sendComplaintResponse(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid complaint id');
    const complaint = await AdminComplaint.findById(id);
    if (!complaint) return null;
    const message = String(body.message || '').trim();
    if (!message) throw new ValidationError('Response message is required');
    const before = complaint.toObject();
    complaint.customerResponseSent = true;
    complaint.customerResponseMessage = message;
    complaint.customerResponseAt = new Date();
    await complaint.save();
    try {
        const { getIO } = await import('../../../../config/socket.js');
        const io = getIO();
        if (io) {
            const driverIdStr = complaint.driverId?.toString();
            if (complaint.complainantType === 'delivery_partner' && driverIdStr) {
                io.to(`delivery:${driverIdStr}`).emit('complaint_status_updated', {
                    complaintId: complaint._id,
                    status: complaint.status === 'in_review' || complaint.status === 'escalated' ? 'in_progress' : complaint.status,
                    adminResponse: complaint.customerResponseMessage,
                    respondedAt: complaint.customerResponseAt,
                    updatedAt: complaint.updatedAt
                });
            }
            const vendorIdStr = complaint.vendorId?.toString();
            if (complaint.complainantType === 'vendor' && vendorIdStr) {
                io.to(`restaurant:${vendorIdStr}`).emit('complaint_status_updated', {
                    complaintId: complaint._id,
                    status: complaint.status,
                    adminResponse: complaint.customerResponseMessage,
                    respondedAt: complaint.customerResponseAt,
                    updatedAt: complaint.updatedAt
                });
            }
        }
    } catch (socketErr) {
        console.error('Failed to emit complaint response socket event:', socketErr);
    }
    await writeAudit(req, 'complaint.response.send', 'AdminComplaint', complaint._id, before, complaint.toObject(), 'Customer response sent');
    return complaint.toObject();
}

// Auto-escalation runner (called by a cron or on-demand)
export async function runAutoEscalation() {
    const now = new Date();
    const toEscalate = await AdminComplaint.find({
        status: { $in: ['open', 'in_review'] },
        autoEscalateAt: { $lte: now }
    }).lean();
    const superAdmin = await FoodAdmin.findOne({ adminRole: 'SUPER_ADMIN', isActive: true }).select('_id').lean();
    for (const c of toEscalate) {
        await AdminComplaint.findByIdAndUpdate(c._id, {
            status: 'escalated',
            escalatedToId: superAdmin?._id || null,
            $push: {
                statusTrail: {
                    status: 'escalated',
                    changedByName: 'System (auto-escalation)',
                    note: `Auto-escalated after timeout (${c.status})`,
                    at: new Date()
                }
            }
        });
    }
    return { escalated: toEscalate.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// AP-07  Fleet Invoice Management
// ─────────────────────────────────────────────────────────────────────────────

export async function listFleetInvoices(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = {};
    if (query.status) filter.status = String(query.status).trim();
    if (query.fleetPartnerId && objectIdOrNull(query.fleetPartnerId)) {
        filter.fleetPartnerId = objectIdOrNull(query.fleetPartnerId);
    }
    const [invoices, total] = await Promise.all([
        FleetInvoice.find(filter)
            .populate('fleetPartnerId', 'companyName city contactEmail bankIban')
            .populate('approvedByAdminId', 'name email')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FleetInvoice.countDocuments(filter)
    ]);
    return { invoices, total, page, limit };
}

export async function approveFleetInvoice(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid invoice id');
    const invoice = await FleetInvoice.findById(id);
    if (!invoice) return null;
    if (invoice.status !== 'submitted') {
        throw new ValidationError('Only submitted invoices can be approved');
    }
    const before = invoice.toObject();
    invoice.status = 'approved';
    invoice.approvedByAdminId = objectIdOrNull(req?.user?.userId);
    invoice.approvedAt = new Date();
    invoice.accountantNote = body.note || '';
    await invoice.save();
    await writeAudit(req, 'fleetInvoice.approve', 'FleetInvoice', invoice._id, before, invoice.toObject(), body.note);
    return invoice.toObject();
}

export async function rejectFleetInvoice(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid invoice id');
    const invoice = await FleetInvoice.findById(id);
    if (!invoice) return null;
    const before = invoice.toObject();
    invoice.status = 'rejected';
    invoice.rejectionReason = String(body.reason || '').trim();
    invoice.approvedByAdminId = objectIdOrNull(req?.user?.userId);
    await invoice.save();
    await writeAudit(req, 'fleetInvoice.reject', 'FleetInvoice', invoice._id, before, invoice.toObject(), body.reason);
    return invoice.toObject();
}

export async function markFleetInvoicePaid(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid invoice id');
    const invoice = await FleetInvoice.findById(id);
    if (!invoice) return null;
    if (invoice.status !== 'approved') throw new ValidationError('Only approved invoices can be marked as paid');
    const before = invoice.toObject();
    invoice.status = 'paid';
    invoice.paidAt = new Date();
    invoice.paymentRef = String(body.paymentRef || '').trim();
    await invoice.save();
    await writeAudit(req, 'fleetInvoice.paid', 'FleetInvoice', invoice._id, before, invoice.toObject(), body.paymentRef);
    return invoice.toObject();
}

// ─────────────────────────────────────────────────────────────────────────────
// AP-07  VAT Report
// ─────────────────────────────────────────────────────────────────────────────

export async function getVatReport(query = {}) {
    const from = query.from ? new Date(query.from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const to = query.to ? new Date(query.to) : new Date();
    const city = query.city ? String(query.city).trim() : null;

    // 1. Customer VAT output — from orders
    const orderFilter = { createdAt: { $gte: from, $lte: to }, orderStatus: 'delivered' };
    if (city) orderFilter.city = city;
    const orderVat = await FoodOrder.aggregate([
        { $match: orderFilter },
        {
            $group: {
                _id: null,
                grossRevenue: { $sum: '$totalAmount' },
                vatCollected: { $sum: { $multiply: ['$totalAmount', 0.08] } },
                orderCount: { $sum: 1 }
            }
        }
    ]);

    // 2. Fleet partner VAT input — from approved invoices
    const invoiceFilter = {
        createdAt: { $gte: from, $lte: to },
        status: { $in: ['approved', 'paid'] }
    };
    const fleetVat = await FleetInvoice.aggregate([
        { $match: invoiceFilter },
        {
            $group: {
                _id: null,
                grossServiceFee: { $sum: '$grossServiceFee' },
                vatPaid: { $sum: '$vatAmount' },
                invoiceCount: { $sum: 1 }
            }
        }
    ]);

    // 3. Refund VAT — from resolved complaints with refunds
    const refundFilter = {
        createdAt: { $gte: from, $lte: to },
        refundStatus: 'processed'
    };
    if (city) refundFilter.city = city;
    const refundVat = await AdminComplaint.aggregate([
        { $match: refundFilter },
        {
            $group: {
                _id: null,
                totalRefunded: { $sum: '$refundAmount' },
                vatRefunded: { $sum: '$refundSplit.vatAmount' },
                refundCount: { $sum: 1 }
            }
        }
    ]);

    const customerVat = orderVat[0] || { grossRevenue: 0, vatCollected: 0, orderCount: 0 };
    const fleetData = fleetVat[0] || { grossServiceFee: 0, vatPaid: 0, invoiceCount: 0 };
    const refundData = refundVat[0] || { totalRefunded: 0, vatRefunded: 0, refundCount: 0 };

    const netVatPosition = customerVat.vatCollected - fleetData.vatPaid - refundData.vatRefunded;

    return {
        period: { from, to, city },
        currency: 'PLN',
        customerOutput: {
            grossRevenue: Math.round(customerVat.grossRevenue * 100) / 100,
            vatCollected: Math.round(customerVat.vatCollected * 100) / 100,
            orderCount: customerVat.orderCount
        },
        fleetInput: {
            grossServiceFee: Math.round(fleetData.grossServiceFee * 100) / 100,
            vatPaid: Math.round(fleetData.vatPaid * 100) / 100,
            invoiceCount: fleetData.invoiceCount
        },
        refundAdjustment: {
            totalRefunded: Math.round(refundData.totalRefunded * 100) / 100,
            vatRefunded: Math.round(refundData.vatRefunded * 100) / 100,
            refundCount: refundData.refundCount
        },
        netVatPosition: Math.round(netVatPosition * 100) / 100
    };
}

// ─────────────────────────────────────────────────────────────────────────────
// AP-09  Admin Employee Management
// ─────────────────────────────────────────────────────────────────────────────

export async function createAdminEmployee(body = {}, req) {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '').trim();
    const name = String(body.name || '').trim();
    const adminRole = body.adminRole ? String(body.adminRole).trim().toUpperCase() : 'CUSTOMER_SERVICE';
    const roleId = body.roleId ? objectIdOrNull(body.roleId) : undefined;
    if (!email || !password || !name) throw new ValidationError('email, password, and name are required');
    if (password.length < 8) throw new ValidationError('Password must be at least 8 characters');
    const existing = await FoodAdmin.findOne({ email });
    if (existing) throw new ValidationError('An admin with this email already exists');
    const admin = await FoodAdmin.create({
        email,
        password,
        name,
        phone: body.phone || '',
        adminRole,
        roleId,
        assignedCityIds: Array.isArray(body.assignedCityIds)
            ? body.assignedCityIds.filter(id => mongoose.Types.ObjectId.isValid(id))
            : [],
        permissions: Array.isArray(body.permissions) ? body.permissions : [],
        isActive: true
    });
    const result = admin.toObject();
    delete result.password;
    await writeAudit(req, 'admin.employee.create', 'FoodAdmin', admin._id, null, result, `Created with role ${adminRole}`);
    return result;
}

export async function updateAdminEmployee(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid admin id');
    const admin = await FoodAdmin.findById(id);
    if (!admin) return null;
    const before = admin.toObject();
    if (body.name !== undefined) admin.name = String(body.name).trim();
    if (body.phone !== undefined) admin.phone = String(body.phone).trim();
    if (body.adminRole !== undefined) {
        const role = String(body.adminRole).trim().toUpperCase();
        const { ADMIN_PRD_ROLES } = await import('../constants/adminPrd.js');
        if (!ADMIN_PRD_ROLES.includes(role)) throw new ValidationError('Invalid admin role');
        admin.adminRole = role;
    }
    if (body.roleId !== undefined) {
        admin.roleId = body.roleId ? objectIdOrNull(body.roleId) : undefined;
    }
    if (body.assignedCityIds !== undefined) {
        admin.assignedCityIds = Array.isArray(body.assignedCityIds)
            ? body.assignedCityIds.filter(id => mongoose.Types.ObjectId.isValid(id))
            : [];
    }
    if (body.isActive !== undefined) admin.isActive = body.isActive !== false;
    if (body.password && String(body.password).length >= 8) {
        admin.password = String(body.password);
    }
    await admin.save();
    const after = admin.toObject();
    delete after.password;
    await writeAudit(req, 'admin.employee.update', 'FoodAdmin', admin._id, before, after, body.reason);
    return after;
}

export async function deleteAdminEmployee(id, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid admin id');
    const admin = await FoodAdmin.findById(id);
    if (!admin) return null;
    // Don't allow deleting the last SUPER_ADMIN
    if (admin.adminRole === 'SUPER_ADMIN') {
        const count = await FoodAdmin.countDocuments({ adminRole: 'SUPER_ADMIN', isActive: true });
        if (count <= 1) throw new ValidationError('Cannot deactivate the last Super Admin');
    }
    const before = admin.toObject();
    admin.isActive = false;
    await admin.save();
    await writeAudit(req, 'admin.employee.deactivate', 'FoodAdmin', admin._id, before, { isActive: false }, 'Admin deactivated');
    return { success: true };
}
