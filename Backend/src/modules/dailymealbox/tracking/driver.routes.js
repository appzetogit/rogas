import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { markVendorReady, verifyCollectionPin, verifyDeliveryPin } from '../delivery/collectionPin.service.js';
import { handleDriverLocationUpdate, driverGoOnline, driverGoOffline } from '../tracking/tracking.service.js';
import { getIO } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { FoodOrder } from '../../food/orders/models/order.model.js';
import { CollectionBatch } from '../delivery/collectionBatch.model.js';
import { DMBDailyOrder } from '../subscription/dmb.dailyOrder.model.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { notifyDriverOfRouteUpdate } from '../subscription/dmb.dailyOrder.service.js';
import { listShiftsForDriver, confirmShift } from '../../food/delivery/services/attendance.service.js';
import crypto from 'crypto';
import { PICKUP_REASONS, PickupProblemError, reportPickupProblem, openBlockingIssue } from './pickupProblem.service.js';

const router = express.Router();

/** Meal boxes in one order: every meal counts by its quantity (2 meals = 2 boxes); a pantry bag counts as one. */
const mealBoxesOf = (o) => (Array.isArray(o?.meals) && o.meals.length ? o.meals.reduce((sum, m) => sum + (Number(m.quantity) || 1), 0) : 1);

/** The delivery fee admin set in Fee Settings (what a driver earns per delivery), or null when none is set. Never invented. */
const configuredDriverFee = async () => {
    const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
    const cfg = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
    const fee = Number(cfg?.feePerOrder);
    return Number.isFinite(fee) && fee > 0 ? fee : null;
};

/**
 * DailyMealBox Driver Routes
 * PRD Reference: DA-03 to DA-09
 */

// ─── Go Online ────────────────────────────────────────────────────────────
router.patch('/go-online', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const io = getIO();
        await driverGoOnline((req.user.userId || req.user._id), io);
        res.json({ success: true, message: 'You are now online' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Go Offline ────────────────────────────────────────────────────────────
router.patch('/go-offline', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const io = getIO();
        await driverGoOffline((req.user.userId || req.user._id), io);
        res.json({ success: true, message: 'You are now offline' });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Update GPS Location (every 5s from driver app) ───────────────────────
router.post('/location', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { lat, lng } = req.body;
        if (lat === undefined || lng === undefined) {
            return res.status(400).json({ success: false, message: 'lat and lng required' });
        }
        // Non-blocking — don't await to keep response fast
        handleDriverLocationUpdate({ driverId: (req.user.userId || req.user._id), lat, lng, timestamp: Date.now() });
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── NEW: Get Slot-Based Route (no CollectionBatch required) ─────────────
router.get('/slot-route', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { checkAdminTimingWindow } = await import('../subscription/dmb.dailyOrder.service.js');
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');

        // ─── 1. Determine active slot and next upcoming slot ─────────────────
        let activeSlot = null;
        let nextSlot = null;
        let slotWindow = null;
        let nextSlotWindow = null;

        const { getVendorTimingSettings } = await import('../../food/admin/services/admin.service.js');
        const timingSettings = await getVendorTimingSettings();
        const SLOTS = timingSettings.slots.map(sl => sl.key);
        const todayDow = new Date().getDay();
        const slotRunsToday = (key) => {
            const sl = timingSettings.slots.find(x => x.key === key);
            return !sl?.availableDays?.length || sl.availableDays.includes(todayDow);
        };

        const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
        const hhmmToMins = (str) => {
            if (!str) return null;
            const [h, m] = str.split(':').map(Number);
            return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
        };
        const fmtTime = (mins) => {
            if (mins === null) return '';
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            const ampm = h < 12 ? 'AM' : 'PM';
            const h12 = h % 12 || 12;
            return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
        };

        for (const slot of SLOTS) {
            const cfg = timingSettings[slot];
            if (!cfg || cfg.isEnabled === false || !slotRunsToday(slot)) continue;
            const start = hhmmToMins(cfg.startTime);
            const end = hhmmToMins(cfg.endTime);
            if (start === null || end === null) continue;
            if (nowMins >= start && nowMins <= end) {
                activeSlot = slot;
                slotWindow = { start: cfg.startTime, end: cfg.endTime, startMins: start, endMins: end };
                break;
            }
        }

        // If no active slot, find the next upcoming slot
        if (!activeSlot) {
            if (timingSettings?.bypassPrepTimingRestrictions) {
                activeSlot = SLOTS.find(slotRunsToday);
                slotWindow = { start: '00:00', end: '23:59', startMins: 0, endMins: 1440 };
            }

            if (!activeSlot) {
                for (const slot of SLOTS) {
                    const cfg = timingSettings[slot];
                    if (!cfg || cfg.isEnabled === false || !slotRunsToday(slot)) continue;
                    const start = hhmmToMins(cfg.startTime);
                    const end = hhmmToMins(cfg.endTime);
                    if (start === null) continue;
                    if (start > nowMins) {
                        nextSlot = slot;
                        nextSlotWindow = { start: cfg.startTime, end: cfg.endTime, startMins: start, endMins: end };
                        break;
                    }
                }

                // STRICT SLOT ENFORCEMENT: Do not show future slots if the current slot is not active
                return res.json({
                    success: true,
                    isSlotActive: false,
                    activeSlot: null,
                    slotWindow: null,
                    nextSlot: nextSlot,
                    nextSlotWindow: nextSlotWindow,
                    stops: [],
                    totalOrders: 0,
                    message: nextSlot
                        ? `Next slot: ${timingSettings[nextSlot].name} starts at ${fmtTime(nextSlotWindow.startMins)}`
                        : 'No further delivery slots today'
                });
            }
        }

        const targetSlot = activeSlot;
        const isSlotActive = true;

        // Fetch driver profile to check assigned slots and vendors
        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');
        const driver = await FoodDeliveryPartner.findById(req.user.userId || req.user._id).lean();
        
        // Ensure driver is allowed to work in the active slot
        if (!driver || !driver.allowedShifts?.includes(targetSlot)) {
            return res.json({
                success: true,
                isSlotActive: false,
                activeSlot: null,
                slotWindow: null,
                nextSlot: null,
                nextSlotWindow: null,
                stops: [],
                totalOrders: 0,
                message: `You are not assigned to the ${targetSlot} shift.`
            });
        }

        let assignedVendors = driver.assignedVendors || [];

        // ─── 2. Build today's date range ─────────────────────────────────────
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // ─── 2.5 Resolve Effective Vendors based on Transfers ────────────────
        const { ServiceRequest } = await import('../serviceManagement/serviceRequest.model.js');
        const { RideTransfer } = await import('../serviceManagement/rideTransfer.model.js');

        // Check if current driver requested unavailability and it was approved
        const unavailability = await ServiceRequest.findOne({
            requesterId: driver._id,
            requestType: 'delivery_unavailable',
            status: 'approved',
            date: { $gte: today, $lt: tomorrow },
            slot: targetSlot
        }).lean();

        if (unavailability) {
            assignedVendors = []; // Driver is skipping this slot
        }

        // Check if current driver was assigned to cover someone else's ride
        const acceptedTransfers = await RideTransfer.find({
            assignedDriverId: driver._id,
            status: 'accepted',
            date: { $gte: today, $lt: tomorrow },
            slot: targetSlot
        }).populate('originalDriverId', 'assignedVendors').lean();

        let effectiveVendorsSet = new Set(assignedVendors.map(v => v.toString()));

        for (const transfer of acceptedTransfers) {
            const origDriver = transfer.originalDriverId;
            if (origDriver && origDriver.assignedVendors) {
                origDriver.assignedVendors.forEach(vId => effectiveVendorsSet.add(vId.toString()));
            }
        }

        const effectiveVendors = Array.from(effectiveVendorsSet);

        // If driver has no vendors assigned for this slot, return early
        if (effectiveVendors.length === 0) {
            return res.json({
                success: true,
                isSlotActive,
                activeSlot: targetSlot,
                slotLabel: targetSlot ? (targetSlot.charAt(0).toUpperCase() + targetSlot.slice(1)) : '',
                slotWindow: slotWindow,
                nextSlot: null,
                nextSlotWindow: null,
                stops: [],
                totalOrders: 0,
                message: `No vendors assigned to you for ${targetSlot} today.`
            });
        }

        // ─── 3. Fetch DMBDailyOrders for the target slot ─────────────────────
        const orders = await DMBDailyOrder.find({
            vendorId: { $in: effectiveVendors },
            deliveryDate: { $gte: today, $lt: tomorrow },
            deliverySlot: targetSlot,
            status: { $nin: ['delivered', 'skipped', 'failed'] }
        })
            .populate('vendorId', 'restaurantName addressLine1 location phone city zoneId')
            .populate('userId', 'name phone')
            .lean();

        // ─── 3.1 Fetch PantryOrders for the target slot today ────────────────
        const startOfDay = new Date(today);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(today);
        endOfDay.setHours(23, 59, 59, 999);

        const pantryOrders = await PantryOrder.find({
            vendorId: { $in: effectiveVendors },
            dailyDeliveries: {
                $elemMatch: {
                    date: { $gte: startOfDay, $lte: endOfDay },
                    slot: targetSlot,
                    status: { $nin: ['delivered', 'failed'] }
                }
            },
            status: { $nin: ['pending_payment', 'cancelled'] } // overall order status paid
        })
            .populate('vendorId', 'restaurantName addressLine1 location phone city zoneId')
            .populate('userId', 'firstName lastName name phone')
            .lean();
        
        // Map pantry orders to match DMBDailyOrder structure for the driver view
        for (const po of pantryOrders) {
            const dailyDelivery = po.dailyDeliveries.find(d => 
                new Date(d.date).getTime() >= startOfDay.getTime() && 
                new Date(d.date).getTime() <= endOfDay.getTime() &&
                d.slot === targetSlot
            );
            
            if (dailyDelivery && !['delivered', 'failed'].includes(dailyDelivery.status)) {
                orders.push({
                    _id: dailyDelivery._id, // use delivery subdoc id to uniquely identify this stop
                    orderId: po.orderId,
                    type: 'pantry',
                    vendorId: po.vendorId,
                    userId: po.userId,
                    status: dailyDelivery.status,
                    deliveryAddress: po.deliveryAddress,
                    deliverySlot: dailyDelivery.slot,
                    deliveryPin: dailyDelivery.deliveryPin || po.deliveryPin || null,
                    items: po.items, // optional, for driver details
                    // We can store a reference back to the parent order
                    parentOrderId: po._id
                });
            }
        }

        if (orders.length === 0) {
            return res.json({
                success: true,
                isSlotActive,
                activeSlot: targetSlot,
                slotWindow: slotWindow,
                nextSlot: null,
                nextSlotWindow: null,
                stops: [],
                totalOrders: 0,
                message: `No ${targetSlot} orders found for today.`
            });
        }

        // ─── 4. Group orders by vendor ───────────────────────────────────────
        const vendorMap = new Map();
        for (const order of orders) {
            const vendorId = String(order.vendorId?._id || order.vendorId);
            if (!vendorMap.has(vendorId)) {
                vendorMap.set(vendorId, { vendor: order.vendorId, orders: [] });
            }
            vendorMap.get(vendorId).orders.push(order);
        }

        // ─── 5. Build stops list ─────────────────────────────────────────────
        const stops = [];
        let stopIdx = 1;

        for (const [vendorId, { vendor, orders: vendorOrders }] of vendorMap) {
            // Determine vendor's preparation status from orders
            const statuses = vendorOrders.map(o => o.status);
            
            // Check if all orders from this vendor have been picked up (out_for_delivery or delivered)
            const allPickedUp = statuses.every(s => s === 'out_for_delivery' || s === 'delivered');

            let vendorStatus = 'scheduled';
            if (allPickedUp) {
                vendorStatus = 'picked'; // All orders collected from vendor
            } else if (statuses.every(s => s === 'ready' || s === 'out_for_delivery')) {
                vendorStatus = 'ready';
            } else if (statuses.some(s => s === 'preparing' || s === 'ready')) {
                vendorStatus = 'preparing';
            }

            const vendorLat = vendor?.location?.latitude
                || (vendor?.location?.coordinates && vendor.location.coordinates[1])
                || null;
            const vendorLng = vendor?.location?.longitude
                || (vendor?.location?.coordinates && vendor.location.coordinates[0])
                || null;

            // Collection PIN: only reveal when ready (not when already picked)
            let collectionPin = null;
            if (vendorStatus === 'ready') {
                // Use the collectionPin stored on first order, or from CollectionBatch
                const existingBatch = await CollectionBatch.findOne({
                    vendorId: vendor?._id || vendorId,
                    deliveryDate: today,
                    deliverySlot: targetSlot
                }).lean();
                collectionPin = existingBatch?.collectionPinHash || vendorOrders[0]?.collectionPin || null;
            }

            // Pickup stop status: 'completed' if all orders are picked up, else 'pending'
            const pickupStopStatus = allPickedUp ? 'completed' : 'pending';

            // An open problem reported at this vendor (so the app keeps showing it after a reload).
            const issueBatch = await CollectionBatch.findOne({
                vendorId: vendor?._id || vendorId, deliveryDate: today, deliverySlot: targetSlot, status: { $nin: ['collected', 'failed'] }
            }).select('pickupIssues').lean();
            const openIssue = (issueBatch?.pickupIssues || []).find((i) => i.status === 'open');

            stops.push({
                stopIndex: stopIdx++,
                id: `pickup_${vendorId}_${targetSlot}`,
                type: 'pickup',
                name: vendor?.restaurantName || '',
                address: vendor?.addressLine1 || '',
                phone: vendor?.phone || '',
                lat: vendorLat,
                lng: vendorLng,
                vendorId,
                slot: targetSlot,
                vendorStatus,  // scheduled | preparing | ready | picked
                collectionPin,
                pickupIssue: openIssue ? { reason: openIssue.reason, blocking: Boolean(openIssue.blocking) } : null,
                orderCount: vendorOrders.length,
                boxCount: vendorOrders.reduce((sum, o) => sum + mealBoxesOf(o), 0),
                status: pickupStopStatus,  // 'completed' when all orders picked up
                isSlotActive
            });

            // Add customer delivery stops for this vendor
            for (const order of vendorOrders) {
                if (order.status === 'out_for_delivery' || order.status === 'delivered') {
                    // Already collected — show delivery stop
                    const custLat = order.deliveryAddress?.location?.latitude
                        || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[1])
                        || null;
                    const custLng = order.deliveryAddress?.location?.longitude
                        || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[0])
                        || null;

                    stops.push({
                        stopIndex: stopIdx++,
                        id: `delivery_${order._id}`,
                        type: 'delivery',
                        name: order.userId?.name || '',
                        address: order.deliveryAddress?.street || order.deliveryAddress?.city || '',
                        phone: order.userId?.phone || '',
                        lat: custLat,
                        lng: custLng,
                        orderId: order._id,
                        boxCount: mealBoxesOf(order),
                        deliveryPin: order.deliveryPin || '',
                        status: order.status === 'delivered' ? 'completed' : 'pending',
                        isSlotActive,
                        vendorId,
                        slot: targetSlot
                    });
                } else {
                    // Not yet collected — still show customer stop (greyed until pickup done)
                    const custLat = order.deliveryAddress?.location?.latitude
                        || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[1])
                        || null;
                    const custLng = order.deliveryAddress?.location?.longitude
                        || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[0])
                        || null;

                    stops.push({
                        stopIndex: stopIdx++,
                        id: `delivery_${order._id}`,
                        type: 'delivery',
                        name: order.userId?.name || '',
                        address: order.deliveryAddress?.street || order.deliveryAddress?.city || '',
                        phone: order.userId?.phone || '',
                        lat: custLat,
                        lng: custLng,
                        orderId: order._id,
                        boxCount: mealBoxesOf(order),
                        deliveryPin: order.deliveryPin || '',
                        status: 'pending',
                        awaitingPickup: true,  // customer stop locked until vendor pickup done
                        isSlotActive,
                        vendorId,
                        slot: targetSlot
                    });
                }
            }
        }

        // Slot window display labels
        const activeWindow = isSlotActive ? slotWindow : null;
        const upcomingWindow = !isSlotActive ? nextSlotWindow : null;

        // Amendment v2 Extra: cold-bag banner (AL), family set counts (AF), customer data per visibility controls (O).
        const { enrichDriverRoute } = await import('./driverRouteEnrich.js');
        const enriched = await enrichDriverRoute({ stops, orders, zoneId: driver?.zoneIds?.[0] });

        return res.json({
            success: true,
            isSlotActive,
            activeSlot: targetSlot,
            slotLabel: targetSlot ? (targetSlot.charAt(0).toUpperCase() + targetSlot.slice(1)) : '',
            slotWindow: activeWindow,
            nextSlot: isSlotActive ? null : nextSlot,
            nextSlotWindow: upcomingWindow,
            nextSlotStartTime: upcomingWindow ? fmtTime(upcomingWindow.startMins) : null,
            stops: enriched.stops,
            hasColdMeals: enriched.hasColdMeals,
            coldBagNotice: enriched.coldBagNotice,
            totalOrders: orders.length,
            totalVendors: vendorMap.size
        });
    } catch (err) {
        console.error('[SLOT-ROUTE]', err);
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Get Today's Route ────────────────────────────────────────────────────
router.get('/my-route', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // Fetch active collection batches for this driver
        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        const batches = await CollectionBatch.find({
            driverId: (req.user.userId || req.user._id),
            status: { $in: ['driver_assigned', 'driver_en_route', 'collected'] }
        }).populate('vendorId', 'restaurantName location addressLine1 phone').sort({ createdAt: -1 });

        const { getVendorTimingSettings } = await import('../../food/admin/services/admin.service.js');
        const timingSettings = await getVendorTimingSettings();
        const nowMins = new Date().getHours() * 60 + new Date().getMinutes();
        const hhmmToMins = (str) => {
            if (!str) return null;
            const [h, m] = str.split(':').map(Number);
            return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
        };

        const allowedSlots = [];
        const SLOTS = timingSettings.slots.map(sl => sl.key);
        if (timingSettings?.bypassPrepTimingRestrictions) {
            allowedSlots.push(...SLOTS);
        } else {
            for (const slot of SLOTS) {
                const cfg = timingSettings[slot];
                if (cfg && cfg.isEnabled !== false) {
                    const start = hhmmToMins(cfg.startTime);
                    // If the slot's start time is now or in the past, it's allowed (active or previous)
                    if (start !== null && start <= nowMins) {
                        allowedSlots.push(slot);
                    }
                }
            }
        }

        let batch = null;
        let orders = [];
        let pOrders = []; // Add pantry orders array

        const currentDriverId = (req.user.userId || req.user._id).toString();

        for (const candidate of batches) {
            // STRICT SLOT ENFORCEMENT: Skip future slots UNLESS driver already accepted this batch or testing mode is active
            const isMyAssignedBatch = candidate.driverId && candidate.driverId.toString() === currentDriverId;
            if (!isMyAssignedBatch && !allowedSlots.includes(candidate.deliverySlot)) {
                continue;
            }

            const candidateOrders = await DMBDailyOrder.find({
                _id: { $in: candidate.orderIds }
            })
                .populate('vendorId', 'restaurantName location addressLine1 phone')
                .populate('userId', 'name phone')
                .sort({ deliverySlot: 1 });
            
            const candidatePantryOrders = await PantryOrder.find({
                'dailyDeliveries._id': { $in: candidate.orderIds }
            })
                .populate('vendorId', 'restaurantName location addressLine1 phone')
                .populate('userId', 'name phone')
                .sort({ deliverySlot: 1 });

            const mappedPantryOrders = [];
            const pantryDriverFee = candidatePantryOrders.length ? await configuredDriverFee() : null;
            for (const po of candidatePantryOrders) {
                const delivery = po.dailyDeliveries.find(d => candidate.orderIds.some(id => id.toString() === d._id.toString()));
                if (delivery) {
                    mappedPantryOrders.push({
                        _id: delivery._id,
                        orderId: po.orderId,
                        type: 'pantry',
                        vendorId: po.vendorId,
                        userId: po.userId,
                        status: delivery.status,
                        deliveryAddress: po.deliveryAddress,
                        deliverySlot: po.deliverySlot,
                        deliveryPin: delivery.deliveryPin || po.deliveryPin,
                        riderEarning: pantryDriverFee || 0,
                        parentOrderId: po._id
                    });
                }
            }

            const allCandidateOrders = [...candidateOrders, ...mappedPantryOrders];

            const isCompleted = allCandidateOrders.length > 0 && allCandidateOrders.every(o => ['delivered', 'skipped', 'failed'].includes(o.status));
            if (!isCompleted && allCandidateOrders.length > 0) {
                batch = candidate;
                orders = candidateOrders;
                pOrders = mappedPantryOrders;
                break;
            }
        }

        if (!batch) {
            return res.json({ success: true, stops: [], orders: [], totalBoxes: 0 });
        }


        // Fetch dynamic delivery fee configured by Admin
        let riderEarningSetting = 0;
        try {
            const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
            const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
            if (feeConfig && Number(feeConfig.feePerOrder) > 0) {
                riderEarningSetting = Number(feeConfig.feePerOrder);
            }
        } catch (err) {
            console.error("Failed to fetch DeliveryOrderFeeSettings in /my-route", err);
        }

        // Generate delivery Pin/OTP mapping if needed
        const batchOtpMap = new Map();
        if (batch.orderIds && batch.collectionPinHash) {
            for (const oId of batch.orderIds) {
                batchOtpMap.set(oId.toString(), batch.collectionPinHash);
            }
        }

        const allOrders = [...orders, ...pOrders];
        const ordersWithPins = [];
        for (const order of allOrders) {
            const orderObj = order.toObject ? order.toObject() : order;
            orderObj.pin = batchOtpMap.get(orderObj._id.toString()) || '';
            
            // Assign Admin-configured delivery fee to riderEarning
            orderObj.riderEarning = orderObj.riderEarning || riderEarningSetting;

            if (!orderObj.deliveryPin) {
                const randomPin = String(Math.floor(1000 + Math.random() * 9000));
                orderObj.deliveryPin = randomPin;
                // Save it asynchronously in the database
                if (orderObj.type === 'pantry') {
                    PantryOrder.updateOne(
                        { 'dailyDeliveries._id': orderObj._id },
                        { $set: { 'dailyDeliveries.$.deliveryPin': randomPin } }
                    ).catch(err => console.error(`Error background updating pantry deliveryPin: ${err.message}`));
                } else {
                    DMBDailyOrder.updateOne({ _id: orderObj._id }, { $set: { deliveryPin: randomPin } })
                        .catch(err => console.error(`Error background updating deliveryPin: ${err.message}`));
                }
            }
            ordersWithPins.push(orderObj);
        }

        const vendorName = batch.vendorId?.restaurantName || '';
        const vendorAddress = batch.vendorId?.addressLine1 || '';
        const vendorPhone = batch.vendorId?.phone || '';
        const vendorLocation = batch.vendorId?.location || null;
        const { listSlots: _listSlots, getSlotLabel: _getSlotLabel } = await import('../deliverySlot/deliverySlot.service.js');
        const slotType = _getSlotLabel(await _listSlots(), batch.deliverySlot);
        // Meal boxes the driver carries (a 2-meal order is 2 boxes), not the number of orders.
        const totalMealBoxCount = allOrders.reduce((sum, o) => sum + mealBoxesOf(o), 0);
        const stopsCount = allOrders.length;

        // Delivery timer: 3 hours countdown from collectedAt (when vendor pickup is verified)
        const deliveryDeadline = batch.collectedAt 
            ? new Date(batch.collectedAt.getTime() + 3 * 60 * 60 * 1000).toISOString()
            : null;

        // Build stops sequence
        let stops = [];
        if (batch.status !== 'collected') {
            // Not collected yet: first stop is the Pickup at vendor
            const vendorLat = batch.vendorId?.location?.latitude || (batch.vendorId?.location?.coordinates && batch.vendorId.location.coordinates[1]);
            const vendorLng = batch.vendorId?.location?.longitude || (batch.vendorId?.location?.coordinates && batch.vendorId.location.coordinates[0]);
            
            stops = [
                {
                    id: 'pickup_' + batch._id,
                    type: 'P',
                    name: vendorName,
                    address: vendorAddress,
                    status: 'READY',
                    orderId: orders[0]?._id,
                    // The pickup is ONE stop for every order in the batch: all customers of this vendor and slot.
                    orderCount: ordersWithPins.length,
                    boxCount: ordersWithPins.reduce((sum, o) => sum + mealBoxesOf(o), 0),
                    vendorLat,
                    vendorLng,
                    vendorId: batch.vendorId?._id || batch.vendorId,
                    slot: batch.deliverySlot
                },
                ...ordersWithPins.map((order, idx) => ({
                    id: 'delivery_' + order._id,
                    type: 'D',
                    name: order.userId?.name || '',
                    address: order.deliveryAddress?.addressLine1 || order.deliveryAddress?.city,
                    status: 'WAITING',
                    orderId: order._id,
                    customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[1]),
                    customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[0]),
                    boxNumber: idx + 1,
                    boxCount: mealBoxesOf(order),
                    vendorId: order.vendorId?._id || order.vendorId,
                    slot: order.deliverySlot,
                    riderEarning: order.riderEarning
                }))
            ];
        } else {
            // Already collected: stops are just the customer deliveries
            // Sort so pending ones are listed first, and completed are at the end
            const sortedOrders = [...ordersWithPins].sort((a, b) => {
                const aDone = ['delivered', 'skipped', 'failed'].includes(a.status);
                const bDone = ['delivered', 'skipped', 'failed'].includes(b.status);
                if (aDone && !bDone) return 1;
                if (!aDone && bDone) return -1;
                return 0;
            });

            let firstPendingFound = false;
            stops = sortedOrders.map((order, idx) => {
                const isDone = ['delivered', 'skipped', 'failed'].includes(order.status);
                let stopStatus = 'WAITING';
                if (isDone) {
                    stopStatus = order.status === 'delivered' ? 'COMPLETED' : 'FAILED';
                } else if (!firstPendingFound) {
                    stopStatus = 'READY';
                    firstPendingFound = true;
                }

                return {
                    id: 'delivery_' + order._id,
                    type: 'D',
                    name: order.userId?.name || '',
                    address: order.deliveryAddress?.addressLine1 || order.deliveryAddress?.city,
                    status: stopStatus,
                    orderId: order._id,
                    customerLat: order.deliveryAddress?.location?.latitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[1]),
                    customerLng: order.deliveryAddress?.location?.longitude || (order.deliveryAddress?.location?.coordinates && order.deliveryAddress.location.coordinates[0]),
                    boxNumber: idx + 1,
                    vendorId: order.vendorId?._id || order.vendorId,
                    slot: order.deliverySlot
                };
            });
        }

        const { enrichDriverRoute } = await import('./driverRouteEnrich.js');
        const enriched = await enrichDriverRoute({ stops, orders: ordersWithPins, zoneId: batch.vendorId?.zoneId });

        res.json({
            success: true,
            stops: enriched.stops,
            orders: enriched.orders,
            hasColdMeals: enriched.hasColdMeals,
            coldBagNotice: enriched.coldBagNotice,
            totalBoxes: ordersWithPins.length,
            vendorName,
            vendorAddress,
            vendorPhone,
            vendorLocation,
            slotType,
            totalMealBoxCount,
            stopsCount,
            deliveryDeadline
        });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Driver Stats (today) ─────────────────────────────────────────────────
router.get('/stats', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const driver = await FoodDeliveryPartner.findById((req.user.userId || req.user._id))
            .select('earningsToday deliveriesToday cashBalance rating isOnline currentShift');
        res.json({ success: true, stats: driver });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Shift Schedule + Attendance (DA-11) ───────────────────────────────────
router.get('/shifts', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const driverId = req.user.userId || req.user._id;
        const { from, to } = req.query;
        const shifts = await listShiftsForDriver(driverId, { fromDate: from, toDate: to });
        res.json({ success: true, data: { shifts } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

router.post('/shifts/:id/confirm', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const driverId = req.user.userId || req.user._id;
        const shift = await confirmShift(driverId, req.params.id);
        res.json({ success: true, data: { shift } });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Verify Collection PIN (at vendor) ────────────────────────────────────
// NEW FLOW: No longer requires CollectionBatch with driver_assigned status.
// Driver can go directly to vendor and verify the PIN from the CollectionBatch
// or from the vendor's slot-based batch. Orders move to out_for_delivery on success.
router.post('/verify-collection-pin', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { pin, collectionGps, vendorId, slot } = req.body;
        const driverId = (req.user.userId || req.user._id);

        if (!pin) {
            return res.status(400).json({ success: false, message: 'PIN is required' });
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);

        // ─── Strategy 1: CollectionBatch lookup (old flow / if batch exists) ───
        let batch = null;

        if (vendorId && slot) {
            // Find by vendor + slot (new flow — driver comes directly)
            batch = await CollectionBatch.findOne({
                vendorId,
                deliveryDate: { $gte: today, $lt: tomorrow },
                deliverySlot: slot,
                status: { $nin: ['collected', 'failed'] }
            });
        }

        if (!batch) {
            // Fallback: find any batch assigned to this driver
            batch = await CollectionBatch.findOne({
                driverId,
                status: { $in: ['driver_assigned', 'pending'] }
            });
        }

        if (batch) {
            // A problem the driver reported at the vendor blocks the collection until an admin clears it.
            const blocking = openBlockingIssue(batch);
            if (blocking) {
                return res.status(423).json({ success: false, code: 'PICKUP_BLOCKED', reason: blocking.reason, message: 'A problem was reported for this pickup. Please wait: support will contact you and clear it or release you from this pickup.' });
            }
            // Amendment 1 #9: after 3 wrong attempts the PIN is locked until the vendor generates a new one.
            const MAX_PIN_ATTEMPTS = 3;
            if ((batch.pinAttempts || 0) >= MAX_PIN_ATTEMPTS) {
                return res.status(423).json({ success: false, code: 'PIN_LOCKED', message: 'Too many wrong PIN attempts. Ask the vendor to generate a new PIN.' });
            }

            // Verify PIN against batch
            if (batch.collectionPinHash !== String(pin)) {
                batch.pinAttempts = (batch.pinAttempts || 0) + 1;
                const locked = batch.pinAttempts >= MAX_PIN_ATTEMPTS;
                if (locked) batch.pinAlertSent = true;
                await batch.save();
                if (locked) {
                    try {
                        const { raiseAdminAlert } = await import('../platform/platformConfig.service.js');
                        await raiseAdminAlert({
                            type: 'collection_pin_locked', severity: 'warning',
                            title: `Collection PIN locked (${batch.batchId})`,
                            message: `A driver entered a wrong collection PIN ${MAX_PIN_ATTEMPTS} times. The vendor must generate a new PIN.`,
                            entityType: 'CollectionBatch', entityId: batch._id, link: '/admin/food/dmb/alerts', dedupeKey: `pinlock:${batch._id}:${batch.pinAttempts}`
                        });
                        const io = getIO();
                        io?.to(`vendor_${batch.vendorId}`).emit('batch_pin_locked', { batchId: batch.batchId });
                    } catch (alertErr) {
                        logger.warn(`PIN-lock alert failed: ${alertErr.message}`);
                    }
                    return res.status(423).json({ success: false, code: 'PIN_LOCKED', message: 'Too many wrong PIN attempts. Ask the vendor to generate a new PIN.' });
                }
                return res.status(400).json({ success: false, message: `Invalid Collection PIN. ${MAX_PIN_ATTEMPTS - batch.pinAttempts} attempt(s) left.` });
            }

            // Mark batch collected
            batch.status = 'collected';
            batch.collectedAt = new Date();
            batch.collectionGps = collectionGps || {};
            if (!batch.driverId) batch.driverId = driverId;
            await batch.save();

            // Update all orders in batch to out_for_delivery
            await DMBDailyOrder.updateMany(
                { _id: { $in: batch.orderIds } },
                { $set: { status: 'out_for_delivery', pickedUpAt: new Date(), 'dispatch.deliveryPartnerId': driverId } }
            );

            // Notify Vendor
            const io = getIO();
            if (io) {
                io.to(`vendor_${batch.vendorId}`).emit('batch_collected_success', {
                    batchId: batch.batchId,
                    message: 'Driver collected the batch successfully'
                });
            }

            notifyDriverOfRouteUpdate(driverId);
            return res.json({ success: true, message: 'Collection verified. Orders are now out for delivery.' });
        }

        // No batch means the vendor has not marked the orders ready (that is when the collection PIN is created), so there is
        // nothing to collect yet. There is no built-in PIN.
        return res.status(404).json({ success: false, message: 'There is nothing to collect yet: the vendor has not marked the orders ready.' });

    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});


// ─── Problem at the vendor (before pickup) ───────────────────────────────
router.get('/pickup-problem-options', authMiddleware, requireRoles('DELIVERY_PARTNER'), (req, res) => {
    res.json({ success: true, reasons: Object.entries(PICKUP_REASONS).map(([key, v]) => ({ key, blocking: v.blocking, photoRequired: v.photoRequired, noteRequired: v.noteRequired })) });
});

router.post('/report-pickup-problem', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { vendorId, slot, reason, note, photoUrl } = req.body;
        const result = await reportPickupProblem({ driverId: (req.user.userId || req.user._id), vendorId, slot, reason, note, photoUrl });
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(err instanceof PickupProblemError ? err.statusCode : 400).json({ success: false, code: err.code, message: err.message });
    }
});

// ─── Verify Delivery PIN (at customer) ────────────────────────────────────
router.post('/verify-delivery-pin', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { orderId, pin, deliveryGps } = req.body;
        const result = await verifyDeliveryPin({
            orderId,
            pinEntered: pin,
            driverId: (req.user.userId || req.user._id),
            deliveryGps
        });
        notifyDriverOfRouteUpdate((req.user.userId || req.user._id));
        res.json({ success: true, ...result });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Delivery Photo Upload ────────────────────────────────────────────────
router.post('/delivery-photo', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { orderId, photoUrl, deliveryGps } = req.body;
        const { confirmDelivery } = await import('../delivery/collectionPin.service.js');
        const order = await confirmDelivery({
            orderId,
            driverId: (req.user.userId || req.user._id),
            method: 'photo',
            deliveryGps,
            proofPhotoUrl: photoUrl
        });
        notifyDriverOfRouteUpdate((req.user.userId || req.user._id));
        res.json({ success: true, order });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Accept Batch (Real-time Broadcast) ───────────────────────────────────
// ─── Pickup request details (opened from the FCM push) ───────────────────────────────────────────────────
// Returns the same shape the `new_delivery_request` socket event carries, but only while the batch is still unclaimed.
router.get('/batch-request/:batchId', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const batch = await CollectionBatch.findOne({ batchId: req.params.batchId });
        if (!batch) return res.status(404).json({ success: false, message: 'This pickup request no longer exists.' });
        if (batch.driverId || batch.status !== 'pending') {
            return res.status(409).json({ success: false, code: 'TAKEN', message: 'Another delivery partner already accepted this pickup.' });
        }
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
        const vendor = await FoodRestaurant.findById(batch.vendorId).select('restaurantName location zoneId addressLine1 phone').lean();
        const orders = await DMBDailyOrder.find({ _id: { $in: batch.orderIds } }).populate('userId', 'name phone').lean();
        const { visibilityFor, driverCustomerView, driverPricingView } = await import('../platform/visibility.js');
        const vis = await visibilityFor('driver', { zoneId: vendor?.zoneId });
        const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
        const feeCfg = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
        const feePerOrder = Number(feeCfg?.feePerOrder) || 0;
        res.json({
            success: true,
            batch: {
                batchId: batch.batchId,
                slotType: batch.deliverySlot,
                totalMealBoxCount: batch.boxCount,
                vendorInfo: {
                    vendorId: vendor?._id,
                    vendorName: vendor?.restaurantName || '',
                    vendorLocation: vendor?.location,
                    vendorAddress: vendor?.addressLine1 || '',
                    vendorPhone: vendor?.phone || ''
                },
                pickupStatus: batch.status,
                orders: orders.map((o) => ({
                    _id: o._id,
                    orderId: o.orderId,
                    status: o.status,
                    deliveryAddress: o.deliveryAddress,
                    meals: o.meals,
                    customer: driverCustomerView({ name: o.userId?.name || '', phone: o.userId?.phone || '' }, vis),
                    pricing: driverPricingView(o.pricing || {}, vis)
                })),
                totalEarnings: feePerOrder * batch.boxCount,
                vendorId: vendor?._id,
                vendorName: vendor?.restaurantName || '',
                vendorLocation: vendor?.location,
                boxCount: batch.boxCount,
                slot: batch.deliverySlot,
                totalOrders: batch.boxCount
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.post('/accept-batch', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { batchId } = req.body;
        if (!batchId) return res.status(400).json({ success: false, message: 'batchId is required' });

        const batch = await CollectionBatch.findOne({ batchId });
        if (!batch) return res.status(404).json({ success: false, message: 'Batch not found' });
        if (batch.driverId) return res.status(400).json({ success: false, message: 'Batch already assigned to another driver' });

        const driver = await FoodDeliveryPartner.findById((req.user.userId || req.user._id));
        if (!driver) return res.status(404).json({ success: false, message: 'Driver profile not found' });

        // Generate 4-digit OTP for the vendor to verify this driver
        const otp = String(Math.floor(1000 + crypto.randomInt(9000))).padStart(4, '0');

        batch.driverId = (req.user.userId || req.user._id);
        batch.status = 'driver_assigned';
        batch.assignedAt = new Date();
        // We temporarily store the raw OTP in `collectionPinHash` or a dedicated field if needed.
        // The driver will show this OTP to the vendor. We can store it directly in batch for simplicity.
        batch.collectionPinHash = otp; 
        await batch.save();

        // Update orders inside the batch (if needed, assign driverId)
        await DMBDailyOrder.updateMany(
            { _id: { $in: batch.orderIds } },
            { $set: { 'dispatch.deliveryPartnerId': (req.user.userId || req.user._id) } }
        );

        const io = getIO();
        if (io) {
            const batchPayload = {
                batchId: batch.batchId,
                driver: {
                    _id: driver._id,
                    name: driver.name,
                    phone: driver.phone,
                    vehicleNumber: driver.vehicleNumber,
                    profilePhoto: driver.profilePhoto
                },
                driverName: driver.name,
                driverPhone: driver.phone,
                driverPhoto: driver.profilePhoto,
                driverVehicle: driver.vehicleNumber,
                otp,
                boxCount: batch.boxCount || batch.orderIds.length,
                totalOrders: batch.boxCount || batch.orderIds.length,
                slot: batch.deliverySlot,
                status: 'driver_assigned'
            };

            // Notify vendor on both rooms (vendor_${vendorId} and restaurant:${vendorId})
            io.to(`vendor_${batch.vendorId}`).emit('batch_accepted', batchPayload);
            io.to(`restaurant:${String(batch.vendorId)}`).emit('batch_accepted', batchPayload);

            // Clear modal from other drivers
            io.emit('remove_delivery_request', { batchId: batch.batchId });
        }

        notifyDriverOfRouteUpdate((req.user.userId || req.user._id));

        res.json({ 
            success: true, 
            message: 'Batch accepted successfully', 
            batch: {
                batchId: batch.batchId,
                vendorId: batch.vendorId,
                boxCount: batch.boxCount,
                otp
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// ─── Confirm Payment (QR or Cash) ──────────────────────────────────────────
router.post('/confirm-payment', authMiddleware, requireRoles('DELIVERY_PARTNER'), async (req, res) => {
    try {
        const { orderId, method } = req.body;
        const driverId = req.user.userId || req.user._id;

        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        const { FoodOrder } = await import('../../food/orders/models/order.model.js');
        const { FoodDeliveryPartner } = await import('../../food/delivery/models/deliveryPartner.model.js');

        // Check if it has already been paid/confirmed to prevent double earnings
        let order = await DMBDailyOrder.findById(orderId);
        let isFoodOrder = false;
        
        if (!order) {
            order = await FoodOrder.findById(orderId);
            isFoodOrder = true;
        }

        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.paymentConfirmed) {
            return res.status(400).json({ success: false, message: 'Payment already confirmed for this order' });
        }

        // The driver earns the order's own fee when it already has one, otherwise the fee admin configured. There is no
        // built-in default: without a configured fee nothing is credited and admin is told to set it.
        const riderEarning = Number(order.riderEarning) > 0 ? Number(order.riderEarning) : await configuredDriverFee();
        if (!riderEarning) {
            import('../platform/platformConfig.service.js')
                .then((m) => m.raiseAdminAlert({
                    type: 'driver_fee_missing', severity: 'critical',
                    title: 'Driver delivery fee is not configured',
                    message: 'A driver could not be credited for a delivery because no delivery fee per order is set. Set it in Fee Settings.',
                    entityType: 'DMBDailyOrder', entityId: orderId, link: '/admin/food/fee-settings', dedupeKey: 'driver-fee-missing'
                }))
                .catch(() => {});
            return res.status(409).json({ success: false, code: 'DRIVER_FEE_NOT_SET', message: 'The delivery fee for drivers is not configured yet. Admin has been told; please try again later.' });
        }

        // Apply earning to driver
        await FoodDeliveryPartner.findByIdAndUpdate(driverId, {
            $inc: {
                earningsToday: riderEarning,
                deliveriesToday: 1
            }
        });

        // If Cash, update payment status so COD wallet reflects it
        if (isFoodOrder) {
            const updateDoc = { paymentConfirmed: true, riderEarning };
            if (method === 'CASH' && order.payment?.method === 'cash') {
                updateDoc['payment.status'] = 'paid';
            }
            await FoodOrder.findByIdAndUpdate(orderId, { $set: updateDoc });
        } else {
            // For DMB Orders
            await DMBDailyOrder.findByIdAndUpdate(orderId, { $set: { paymentConfirmed: true, riderEarning, paymentMethod: method } });
        }

        res.json({ success: true, riderEarning, message: 'Payment confirmed successfully' });
    } catch (err) {
        console.error("Confirm payment error:", err);
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;

