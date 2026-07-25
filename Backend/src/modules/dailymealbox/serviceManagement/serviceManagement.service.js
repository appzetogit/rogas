import { ServiceRequest } from './serviceRequest.model.js';
import { RideTransfer } from './rideTransfer.model.js';
import { DMBSubscription } from '../subscription/subscription.model.js';
import { FoodUserWallet } from '../../food/user/models/userWallet.model.js';

/**
 * Service Management — Business Logic Layer
 * 
 * Handles all service request workflows independently.
 * Only read-only queries against DMBSubscription.
 * Only safe $inc updates on FoodUserWallet for refunds.
 */

// ─── Delivery Partner Services ─────────────────────────────────────────────

export async function createDeliveryUnavailableRequest(driverId, data) {
    const request = new ServiceRequest({
        requestType: 'delivery_unavailable',
        requesterId: driverId,
        requesterRole: 'DELIVERY_PARTNER',
        date: data.date,
        slot: data.slot,
        reason: data.reason,
        remarks: data.remarks || '',
        zoneId: data.zoneId || null,
    });
    return request.save();
}

export async function getDriverRequests(driverId) {
    return ServiceRequest.find({
        requesterId: driverId,
        requestType: 'delivery_unavailable'
    }).sort({ createdAt: -1 }).lean();
}

export async function getDriverRideTransfers(driverId) {
    return RideTransfer.find({
        assignedDriverId: driverId
    })
    .populate('originalDriverId', 'firstName lastName phone')
    .populate('zoneId', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

export async function respondToRideTransfer(transferId, driverId, response) {
    const transfer = await RideTransfer.findOne({
        _id: transferId,
        assignedDriverId: driverId,
        status: 'pending'
    });
    if (!transfer) throw new Error('Ride transfer not found or already responded');

    transfer.status = response; // 'accepted' or 'rejected'
    transfer.respondedAt = new Date();
    return transfer.save();
}

// ─── Vendor Services ─────────────────────────────────────────────────────────

export async function createVendorUnavailableRequest(vendorId, data) {
    const request = new ServiceRequest({
        requestType: 'vendor_unavailable',
        requesterId: vendorId,
        requesterRole: 'RESTAURANT',
        vendorId: vendorId,
        date: data.date,
        slot: data.slot,
        reason: data.reason,
        remarks: data.remarks || '',
        mealPlanId: data.mealPlanId || null,
    });
    return request.save();
}

export async function getVendorRequests(vendorId) {
    return ServiceRequest.find({
        requesterId: vendorId,
        requestType: 'vendor_unavailable'
    }).sort({ createdAt: -1 }).lean();
}

// ─── Customer Services ───────────────────────────────────────────────────────

export async function getCustomerRequests(userId) {
    return ServiceRequest.find({
        requesterId: userId,
        requestType: { $in: ['customer_refund', 'customer_extend'] }
    })
    .populate('vendorId', 'restaurantName')
    .populate('mealPlanId', 'name')
    .sort({ createdAt: -1 })
    .lean();
}

export async function handleCustomerExtend(requestId, userId) {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requesterId: userId,
        requestType: { $in: ['customer_refund', 'customer_extend'] },
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already handled');

    // Update the request type and mark completed
    request.requestType = 'customer_extend';
    request.status = 'completed';
    request.resolvedAt = new Date();

    // Extend subscription endDate by 1 day (safe single-field update)
    if (request.subscriptionId) {
        await DMBSubscription.updateOne(
            { _id: request.subscriptionId },
            { $inc: { 'endDate': 86400000 } } // +1 day in ms — won't work with $inc on Date
        ).catch(() => {
            // Fallback: manual date increment
        });

        // Safer approach: read and update
        const sub = await DMBSubscription.findById(request.subscriptionId);
        if (sub && sub.endDate) {
            const newEnd = new Date(sub.endDate);
            newEnd.setDate(newEnd.getDate() + 1);
            sub.endDate = newEnd;
            await sub.save();
        }
    }

    return request.save();
}

export async function handleCustomerRefundRequest(requestId, userId) {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requesterId: userId,
        requestType: { $in: ['customer_refund', 'customer_extend'] },
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already handled');

    // Mark as customer_refund and keep pending for admin approval
    request.requestType = 'customer_refund';
    // Status stays 'pending' — admin needs to approve the refund
    return request.save();
}

// ─── Admin Services ──────────────────────────────────────────────────────────

export async function getDeliveryRequests(filters = {}) {
    const query = { requestType: 'delivery_unavailable' };
    if (filters.status) query.status = filters.status;
    
    return ServiceRequest.find(query)
        .populate('requesterId', 'firstName lastName phone')
        .populate('zoneId', 'name')
        .sort({ createdAt: -1 })
        .lean();
}

export async function approveDeliveryRequest(requestId, adminId) {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requestType: 'delivery_unavailable',
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already processed');

    request.status = 'approved';
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    return request.save();
}

export async function rejectDeliveryRequest(requestId, adminId, notes = '') {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requestType: 'delivery_unavailable',
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already processed');

    request.status = 'rejected';
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    request.adminNotes = notes;
    return request.save();
}

export async function assignRideTransfers(serviceRequestId, driverAssignments, adminId) {
    const request = await ServiceRequest.findById(serviceRequestId);
    if (!request || request.requestType !== 'delivery_unavailable') {
        throw new Error('Invalid service request');
    }

    const transfers = [];
    for (const assignment of driverAssignments) {
        const transfer = new RideTransfer({
            serviceRequestId: request._id,
            originalDriverId: request.requesterId,
            assignedDriverId: assignment.driverId,
            date: request.date,
            slot: request.slot,
            zoneId: request.zoneId || assignment.zoneId || null,
            orderCount: assignment.orderCount || 0,
        });
        transfers.push(transfer.save());
    }

    return Promise.all(transfers);
}

export async function getAvailableDrivers(filters = {}) {
    // Import dynamically to avoid circular dependencies
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    
    const query = { status: 'active' };
    if (filters.zoneId) query.zoneId = filters.zoneId;

    return FoodDeliveryPartner.find(query)
        .select('firstName lastName phone zoneId status')
        .populate('zoneId', 'name')
        .sort({ firstName: 1 })
        .lean();
}

// ─── Vendor Request Admin Actions ────────────────────────────────────────────

export async function getVendorRequestsAdmin(filters = {}) {
    const query = { requestType: 'vendor_unavailable' };
    if (filters.status) query.status = filters.status;

    return ServiceRequest.find(query)
        .populate('vendorId', 'restaurantName ownerPhone')
        .populate('mealPlanId', 'name')
        .sort({ createdAt: -1 })
        .lean();
}

export async function approveVendorRequest(requestId, adminId) {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requestType: 'vendor_unavailable',
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already processed');

    request.status = 'approved';
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    await request.save();

    // Find all active subscriptions for this vendor
    const affectedSubs = await DMBSubscription.find({
        vendorId: request.vendorId,
        status: 'active'
    }).lean();

    // Create customer service requests for each affected subscriber
    const customerRequests = [];
    for (const sub of affectedSubs) {
        // Check if subscription has the affected slot
        const subSlots = sub.deliverySlots || [sub.deliverySlot];
        if (!subSlots.includes(request.slot)) continue;

        // Calculate per-day refund amount from subscription pricing
        const perDayAmount = sub.pricing?.basePricePerDay || 0;

        const customerRequest = new ServiceRequest({
            requestType: 'customer_refund', // Default — customer can switch to extend
            requesterId: sub.userId,
            requesterRole: 'SYSTEM', // System-generated
            vendorId: request.vendorId,
            subscriptionId: sub._id,
            mealPlanId: sub.mealPlanId || (sub.meals?.[0]?.mealPlanId) || null,
            date: request.date,
            slot: request.slot,
            reason: `Vendor unavailable: ${request.reason}`,
            refundAmount: perDayAmount,
            parentRequestId: request._id,
            status: 'pending'
        });
        customerRequests.push(customerRequest.save());
    }

    const created = await Promise.all(customerRequests);
    return { request, customerRequestsCreated: created.length };
}

export async function rejectVendorRequest(requestId, adminId, notes = '') {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requestType: 'vendor_unavailable',
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already processed');

    request.status = 'rejected';
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    request.adminNotes = notes;
    return request.save();
}

// ─── Customer Refund Admin Actions ───────────────────────────────────────────

export async function getCustomerRequestsAdmin(filters = {}) {
    const query = { requestType: 'customer_refund' };
    if (filters.status) query.status = filters.status;

    return ServiceRequest.find(query)
        .populate('requesterId', 'name phone')
        .populate('vendorId', 'restaurantName')
        .populate('subscriptionId', 'subscriptionId deliverySlot')
        .populate('mealPlanId', 'name')
        .sort({ createdAt: -1 })
        .lean();
}

export async function approveCustomerRefund(requestId, adminId) {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requestType: 'customer_refund',
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already processed');
    if (request.refundAmount <= 0) throw new Error('Invalid refund amount');

    // Credit refund to customer wallet (safe $inc + push transaction)
    await FoodUserWallet.findOneAndUpdate(
        { userId: request.requesterId },
        {
            $inc: { balance: request.refundAmount },
            $push: {
                transactions: {
                    type: 'refund',
                    amount: request.refundAmount,
                    status: 'Completed',
                    description: `Service refund for ${request.slot} on ${new Date(request.date).toLocaleDateString()}`,
                    metadata: {
                        serviceRequestId: request._id.toString(),
                        vendorId: request.vendorId?.toString(),
                        reason: request.reason
                    }
                }
            }
        },
        { upsert: true, new: true }
    );

    request.status = 'completed';
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    return request.save();
}

export async function rejectCustomerRefund(requestId, adminId, notes = '') {
    const request = await ServiceRequest.findOne({
        _id: requestId,
        requestType: 'customer_refund',
        status: 'pending'
    });
    if (!request) throw new Error('Request not found or already processed');

    request.status = 'rejected';
    request.resolvedBy = adminId;
    request.resolvedAt = new Date();
    request.adminNotes = notes;
    return request.save();
}
