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
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');

    const transfers = await RideTransfer.find({
        assignedDriverId: driverId
    })
    .populate({ 
        path: 'originalDriverId', 
        select: 'name phone zoneIds assignedVendors',
        populate: { path: 'zoneIds', select: 'name' }
    })
    .populate('zoneId', 'name')
    .sort({ createdAt: -1 })
    .lean();

    // Dynamically calculate orderCount for legacy requests or if 0
    for (const transfer of transfers) {
        if (!transfer.orderCount && transfer.originalDriverId?.assignedVendors?.length > 0) {
            const dateStart = new Date(transfer.date);
            dateStart.setHours(0, 0, 0, 0);
            const dateEnd = new Date(dateStart);
            dateEnd.setDate(dateStart.getDate() + 1);
            
            const dmbCount = await DMBDailyOrder.countDocuments({
                vendorId: { $in: transfer.originalDriverId.assignedVendors },
                deliveryDate: { $gte: dateStart, $lt: dateEnd },
                deliverySlot: transfer.slot,
                status: { $nin: ['delivered', 'skipped', 'failed', 'cancelled'] }
            });
            
            const pantryCount = await PantryOrder.countDocuments({
                vendorId: { $in: transfer.originalDriverId.assignedVendors },
                dailyDeliveries: {
                    $elemMatch: {
                        date: { $gte: dateStart, $lte: dateEnd },
                        slot: transfer.slot,
                        status: { $nin: ['delivered', 'failed'] }
                    }
                },
                status: { $nin: ['pending_payment', 'cancelled'] }
            });

            transfer.orderCount = dmbCount + pantryCount;
        }
    }

    return transfers;
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
        slots: data.slots || (data.slot ? [data.slot] : []),
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
    .populate('subscriptionId', 'deliverySlots deliverySlot')
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

    // Safe approach: read and update
    if (request.subscriptionId) {
        const { DMBSubscription } = await import('../subscription/subscription.model.js');
        const sub = await DMBSubscription.findById(request.subscriptionId);
        
        if (sub) {
            const subSlots = sub.deliverySlots || (sub.deliverySlot ? [sub.deliverySlot] : []);
            
            // OPTION 1 ENFORCEMENT: Prevent full day extension for partial cancellations
            const reqSlots = request.slots && request.slots.length > 0 ? request.slots : [request.slot];
            if (subSlots.length > 1 && reqSlots.length < subSlots.length) {
                throw new Error('This cancellation is only for a single meal. Full-day extensions are not allowed. Please choose Refund.');
            }

            if (sub.endDate) {
                const newEnd = new Date(sub.endDate);
                newEnd.setDate(newEnd.getDate() + 1);
                sub.endDate = newEnd;
                await sub.save();
            }
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
    request.requesterRole = 'USER'; // Indicate customer has claimed it
    // Status stays 'pending' — admin needs to approve the refund
    return request.save();
}

// ─── Admin Services ──────────────────────────────────────────────────────────

export async function getDeliveryRequests(filters = {}) {
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
    const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
    const { RideTransfer } = await import('./rideTransfer.model.js');

    const query = { requestType: 'delivery_unavailable' };
    if (filters.status) query.status = filters.status;
    
    const requests = await ServiceRequest.find(query)
        .populate({ 
            path: 'requesterId', 
            model: FoodDeliveryPartner, 
            select: 'name phone zoneIds assignedVendors',
            populate: { path: 'zoneIds', select: 'name', model: 'FoodZone' } 
        })
        .sort({ createdAt: -1 })
        .lean();

    for (const req of requests) {
        if (!req.requesterId || !req.requesterId.assignedVendors || req.requesterId.assignedVendors.length === 0) {
            req.orderCount = 0;
            continue;
        }

        const dateStart = new Date(req.date);
        dateStart.setHours(0, 0, 0, 0);
        const dateEnd = new Date(dateStart);
        dateEnd.setDate(dateStart.getDate() + 1);
        
        const dmbCount = await DMBDailyOrder.countDocuments({
            vendorId: { $in: req.requesterId.assignedVendors },
            deliveryDate: { $gte: dateStart, $lt: dateEnd },
            deliverySlot: req.slot,
            status: { $nin: ['delivered', 'skipped', 'failed', 'cancelled'] }
        });
        
        const pantryCount = await PantryOrder.countDocuments({
            vendorId: { $in: req.requesterId.assignedVendors },
            dailyDeliveries: {
                $elemMatch: {
                    date: { $gte: dateStart, $lte: dateEnd },
                    slot: req.slot,
                    status: { $nin: ['delivered', 'failed'] }
                }
            },
            status: { $nin: ['pending_payment', 'cancelled'] }
        });

        req.orderCount = dmbCount + pantryCount;
        
        // Fetch RideTransfers
        const transfers = await RideTransfer.find({ serviceRequestId: req._id })
            .populate('assignedDriverId', 'name phone profilePhoto')
            .lean();
        
        req.transfers = transfers;
        if (transfers.some(t => t.status === 'accepted')) {
            req.transferStatus = 'accepted';
        } else if (transfers.some(t => t.status === 'pending')) {
            req.transferStatus = 'pending';
        } else if (transfers.length > 0 && transfers.every(t => t.status === 'rejected')) {
            req.transferStatus = 'rejected';
        } else {
            req.transferStatus = 'none';
        }
    }

    return requests;
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
    const { ServiceRequest } = await import('./serviceRequest.model.js');
    const { RideTransfer } = await import('./rideTransfer.model.js');
    
    const query = { status: 'approved' };
    if (filters.zoneId) query.zoneIds = filters.zoneId;

    if (filters.slot) {
        query.allowedShifts = filters.slot; // Array contains
    }

    let drivers = await FoodDeliveryPartner.find(query)
        .select('firstName lastName name phone zoneIds status allowedShifts maxVendorCapacity assignedVendors')
        .populate('zoneIds', 'name')
        .sort({ firstName: 1 })
        .lean();

    if (filters.date && filters.slot) {
        const targetDate = new Date(filters.date);
        targetDate.setHours(0, 0, 0, 0);
        const nextDate = new Date(targetDate);
        nextDate.setDate(targetDate.getDate() + 1);

        // Exclude drivers who are unavailable (approved ServiceRequest)
        const unavailableRequests = await ServiceRequest.find({
            requestType: 'delivery_unavailable',
            status: 'approved',
            date: { $gte: targetDate, $lt: nextDate },
            slot: filters.slot
        }).lean();
        
        const unavailableIds = unavailableRequests.map(r => r.requesterId.toString());

        // Exclude drivers who already have a RideTransfer assigned to them for this slot/date
        const assignedTransfers = await RideTransfer.find({
            date: { $gte: targetDate, $lt: nextDate },
            slot: filters.slot,
            status: { $in: ['pending', 'accepted'] }
        }).lean();
        
        const assignedIds = assignedTransfers.map(t => t.assignedDriverId.toString());

        // Find drivers who have their OWN deliveries for this date/slot
        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
        
        const busyVendors = new Set();
        
        const dmbBusyVendors = await DMBDailyOrder.distinct('vendorId', {
            deliveryDate: { $gte: targetDate, $lt: nextDate },
            deliverySlot: filters.slot,
            status: { $nin: ['delivered', 'skipped', 'failed', 'cancelled'] }
        });
        dmbBusyVendors.forEach(v => busyVendors.add(v.toString()));
        
        const pantryBusyVendors = await PantryOrder.distinct('vendorId', {
            dailyDeliveries: {
                $elemMatch: {
                    date: { $gte: targetDate, $lte: nextDate },
                    slot: filters.slot,
                    status: { $nin: ['delivered', 'failed'] }
                }
            },
            status: { $nin: ['pending_payment', 'cancelled'] }
        });
        pantryBusyVendors.forEach(v => busyVendors.add(v.toString()));

        const busyDriverIds = new Set();
        for (const driver of drivers) {
            if (driver.assignedVendors && driver.assignedVendors.length > 0) {
                const hasOwnOrders = driver.assignedVendors.some(v => busyVendors.has(v.toString()));
                if (hasOwnOrders) {
                    busyDriverIds.add(driver._id.toString());
                }
            }
        }

        const excludeIds = new Set([...unavailableIds, ...assignedIds, ...busyDriverIds]);

        drivers = drivers.filter(d => !excludeIds.has(d._id.toString()));
    }

    return drivers;
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
    const reqSlots = request.slots && request.slots.length > 0 ? request.slots : [request.slot];

    for (const sub of affectedSubs) {
        // Check if subscription has any of the affected slots
        const subSlots = sub.deliverySlots || (sub.deliverySlot ? [sub.deliverySlot] : []);
        
        const overlappingSlots = subSlots.filter(s => reqSlots.includes(s));
        if (overlappingSlots.length === 0) continue;

        // Calculate proportional refund amount based on how many meals they miss
        const basePrice = sub.pricing?.basePricePerDay || 0;
        const refundAmount = (basePrice / subSlots.length) * overlappingSlots.length;

        const customerRequest = new ServiceRequest({
            requestType: 'customer_refund', // Default — customer can switch to extend
            requesterId: sub.userId,
            requesterRole: 'SYSTEM', // System-generated
            vendorId: request.vendorId,
            subscriptionId: sub._id,
            mealPlanId: sub.mealPlanId || (sub.meals?.[0]?.mealPlanId) || null,
            date: request.date,
            slots: overlappingSlots,
            reason: `Vendor unavailable: ${request.reason}`,
            refundAmount: refundAmount,
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
    const { FoodUser } = await import('../../../core/users/user.model.js');

    const query = { 
        $or: [
            { requestType: 'customer_refund', requesterRole: 'USER' },
            { requestType: 'customer_extend' }
        ]
    };
    if (filters.status) query.status = filters.status;

    return ServiceRequest.find(query)
        .populate({ path: 'requesterId', model: FoodUser, select: 'name phone email' })
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
