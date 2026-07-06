import mongoose from 'mongoose';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';

/**
 * Assigns eligible unassigned vendors to a newly approved or updated delivery partner.
 * @param {string} partnerId 
 */
export async function assignVendorsToDeliveryPartner(partnerId) {
    const partner = await FoodDeliveryPartner.findById(partnerId);
    
    if (!partner || partner.status !== 'approved') return;
    
    // They must have capacity
    const currentCount = partner.assignedVendors?.length || 0;
    let availableCapacity = partner.maxVendorCapacity - currentCount;
    
    if (availableCapacity <= 0) return;

    // Find eligible vendors
    // 1. Unassigned
    // 2. Same zone(s)
    // 3. Matching shifts (vendor.mealSlots intersects partner.allowedShifts)
    const eligibleVendors = await FoodRestaurant.find({
        status: 'approved',
        assignedDeliveryPartnerId: null,
        zoneId: { $in: partner.zoneIds },
        mealSlots: { $in: partner.allowedShifts }
    }).limit(availableCapacity);

    if (eligibleVendors.length === 0) return;

    const vendorIds = eligibleVendors.map(v => v._id);

    // Update the partner
    await FoodDeliveryPartner.findByIdAndUpdate(partnerId, {
        $push: { assignedVendors: { $each: vendorIds } }
    });

    // Update the vendors
    await FoodRestaurant.updateMany(
        { _id: { $in: vendorIds } },
        { $set: { assignedDeliveryPartnerId: partner._id } }
    );
}

/**
 * Assigns an eligible delivery partner to a newly approved vendor.
 * @param {string} vendorId 
 */
export async function assignDeliveryPartnerToVendor(vendorId) {
    const vendor = await FoodRestaurant.findById(vendorId);
    if (!vendor || vendor.status !== 'approved' || vendor.assignedDeliveryPartnerId) return;

    // Find eligible partners
    // 1. Approved
    // 2. Matching zone
    // 3. Matching shift (partner.allowedShifts intersects vendor.mealSlots)
    const eligiblePartners = await FoodDeliveryPartner.find({
        status: 'approved',
        zoneIds: vendor.zoneId,
        allowedShifts: { $in: vendor.mealSlots }
    });

    if (eligiblePartners.length === 0) return;

    // Filter by capacity and sort by load
    const partnersWithCapacity = eligiblePartners.filter(p => {
        const capacity = p.maxVendorCapacity || 0;
        const currentLoad = p.assignedVendors?.length || 0;
        return currentLoad < capacity;
    });

    if (partnersWithCapacity.length === 0) return;

    // Sort by lowest load
    partnersWithCapacity.sort((a, b) => {
        return (a.assignedVendors?.length || 0) - (b.assignedVendors?.length || 0);
    });

    const selectedPartner = partnersWithCapacity[0];

    // Update the vendor
    await FoodRestaurant.findByIdAndUpdate(vendor._id, {
        $set: { assignedDeliveryPartnerId: selectedPartner._id }
    });

    // Update the partner
    await FoodDeliveryPartner.findByIdAndUpdate(selectedPartner._id, {
        $push: { assignedVendors: vendor._id }
    });
}

/**
 * Fetch eligible vendors for a given delivery partner based on zone and shifts.
 */
export async function getEligibleVendorsForDeliveryPartner(partnerId, zoneIds, allowedShifts) {
    if (!zoneIds || !Array.isArray(zoneIds) || zoneIds.length === 0) return [];

    const query = {
        status: 'approved',
        zoneId: { $in: zoneIds }
    };

    if (allowedShifts && allowedShifts.length > 0) {
        query.mealSlots = { $in: allowedShifts };
    }

    // Must be either unassigned, or already assigned to THIS delivery partner
    query.$or = [
        { assignedDeliveryPartnerId: null },
        { assignedDeliveryPartnerId: partnerId }
    ];

    const vendors = await FoodRestaurant.find(query).select('restaurantName _id status assignedDeliveryPartnerId').lean();
    return vendors.map(v => ({
        id: v._id,
        name: v.restaurantName,
        status: v.status,
        isCurrentlyAssigned: String(v.assignedDeliveryPartnerId) === String(partnerId)
    }));
}

/**
 * Update a delivery partner's assignment configuration and their assigned vendors list.
 */
export async function updateDeliveryPartnerAssignment(partnerId, payload) {
    const { zoneIds, allowedShifts, maxVendorCapacity, selectedVendorIds } = payload;
    
    if (!zoneIds || !Array.isArray(zoneIds) || zoneIds.length === 0) {
        throw new Error('At least one valid Zone ID must be selected');
    }

    if (selectedVendorIds.length > maxVendorCapacity && maxVendorCapacity > 0) {
        throw new Error(`Cannot assign ${selectedVendorIds.length} vendors when capacity is ${maxVendorCapacity}`);
    }

    const partner = await FoodDeliveryPartner.findById(partnerId);
    if (!partner) throw new Error('Delivery partner not found');

    const oldVendorIds = (partner.assignedVendors || []).map(v => String(v));
    const newVendorIds = (selectedVendorIds || []).map(v => String(v));

    // Calculate additions and removals
    const vendorsToAdd = newVendorIds.filter(id => !oldVendorIds.includes(id));
    const vendorsToRemove = oldVendorIds.filter(id => !newVendorIds.includes(id));

    // Update the partner document
    partner.zoneIds = zoneIds.map(z => new mongoose.Types.ObjectId(z));
    partner.allowedShifts = allowedShifts || [];
    partner.maxVendorCapacity = Number(maxVendorCapacity) || 0;
    partner.assignedVendors = newVendorIds.map(v => new mongoose.Types.ObjectId(v));
    await partner.save();

    // Update vendors: add the new ones
    if (vendorsToAdd.length > 0) {
        await FoodRestaurant.updateMany(
            { _id: { $in: vendorsToAdd } },
            { $set: { assignedDeliveryPartnerId: partner._id } }
        );
    }

    // Update vendors: remove the old ones
    if (vendorsToRemove.length > 0) {
        await FoodRestaurant.updateMany(
            { _id: { $in: vendorsToRemove } },
            { $set: { assignedDeliveryPartnerId: null } }
        );
    }

    return partner;
}
