// import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
// import { DMBSubscription } from './subscription.model.js';
// import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
// import { CollectionBatch } from '../delivery/collectionBatch.model.js';
// import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
// import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
// import { getIO } from '../../../config/socket.js';
// import { logger } from '../../../utils/logger.js';
// import crypto from 'crypto';

// /**
//  * DMB Daily Orders Service
//  * Handles creation and management of per-day delivery instances
//  */

// // ─── Helpers ──────────────────────────────────────────────────────────────────
// const toDateOnly = (date) => {
//     const d = new Date(date);
//     d.setUTCHours(0, 0, 0, 0);
//     return d;
// };

// const dateStr = (date) => new Date(date).toISOString().split('T')[0];

// // ─── Helper: Fetch fresh dishName from DMBDailyMenu & update order if needed ──
// // Ensures vendor's latest meal choice always reflects in customer orders.
// const refreshMealNameFromDailyMenu = async (order) => {
//     try {
//         const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
//         const dayStart = toDateOnly(new Date(order.deliveryDate));
//         let updated = false;

//         for (const m of order.meals) {
//             const planId = m.mealPlanId?._id || m.mealPlanId;
//             if (!planId) continue;
//             try {
//                 let dailyMenuItem = await DMBDailyMenu.findOne({
//                     vendorId: order.vendorId,
//                     mealPlanId: planId,
//                     date: dayStart
//                 }).lean();
//                 if (!dailyMenuItem) {
//                     dailyMenuItem = await DMBDailyMenu.findOne({
//                         vendorId: order.vendorId,
//                         date: dayStart
//                     }).lean();
//                 }
//                 if (dailyMenuItem?.dishName && m.name !== dailyMenuItem.dishName) {
//                     m.name = dailyMenuItem.dishName;
//                     updated = true;
//                 }
//             } catch (e) { /* ignore */ }
//         }

//         if (updated) {
//             await DMBDailyOrder.updateOne({ _id: order._id }, { $set: { meals: order.meals } });
//         }
//     } catch (e) {
//         // silently ignore import errors
//     }
//     return order;
// };

// // ─── Helper: Fetch and attach custom daily menu details (photo, nutrition) to lean orders ──
// const attachDailyMenuDetails = async (orders) => {
//     try {
//         const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
//         const ordersArray = Array.isArray(orders) ? orders : [orders];
//         for (const order of ordersArray) {
//             const dayStart = toDateOnly(new Date(order.deliveryDate));
//             for (const m of (order.meals || [])) {
//                 const planId = m.mealPlanId?._id || m.mealPlanId;
//                 let dailyMenuItem = null;
//                 if (planId) {
//                     dailyMenuItem = await DMBDailyMenu.findOne({
//                         vendorId: order.vendorId?._id || order.vendorId,
//                         mealPlanId: planId,
//                         date: dayStart
//                     }).lean();
//                 }
//                 if (!dailyMenuItem) {
//                     dailyMenuItem = await DMBDailyMenu.findOne({
//                         vendorId: order.vendorId?._id || order.vendorId,
//                         date: dayStart
//                     }).lean();
//                 }
//                 if (dailyMenuItem) {
//                     if (dailyMenuItem.dishName) m.name = dailyMenuItem.dishName;
//                     if (dailyMenuItem.photo) m.customPhoto = dailyMenuItem.photo;
//                     if (dailyMenuItem.nutrition) m.customNutrition = dailyMenuItem.nutrition;
//                     if (dailyMenuItem.description) m.customDescription = dailyMenuItem.description;
//                 }
//             }
//         }
//     } catch (e) {
//         // silently ignore
//     }
//     return orders;
// };


// /**
//  * Generate DMBDailyOrder records for all active subscriptions on a given date.
//  * Called at startup / CRON / on-demand to ensure orders exist for today+tomorrow.
//  */
// export const generateDailyOrdersForDate = async (targetDate = new Date()) => {
//     const dayStart = toDateOnly(targetDate);
//     const dayEnd = new Date(dayStart);
//     dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

//     const dayOfWeek = dayStart.getUTCDay(); // 0=Sun, 1=Mon...6=Sat

//     // Skip if Sunday (no deliveries on Sunday by default)
//     // For mon_fri subscriptions, skip Sat & Sun
//     // This can be customized per subscription's deliveryDays

//     const activeSubscriptions = await DMBSubscription.find({ status: 'active' })
//         .populate('meals.mealPlanId', 'name pricePerDay')
//         .lean();

//     let created = 0;
//     let skipped = 0;

//     for (const sub of activeSubscriptions) {
//         try {
//             // Check if delivery day is applicable
//             const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
//             const isSaturday = dayOfWeek === 6;
//             const isSunday = dayOfWeek === 0;

//             const isMonFri = sub.deliveryDays === 'mon_fri';
//             const isFullWeek = sub.deliveryDays === 'full_week';

//             if (isMonFri && !isWeekday) {
//                 skipped++;
//                 continue;
//             }
//             /* For Sunday delivery enablement: commented out Sunday skip for full_week
//             if (isFullWeek && isSunday) {
//                 // Full week still skips Sunday in this implementation
//                 // Can be changed later per PRD
//                 skipped++;
//                 continue;
//             }
//             */

//             // Check if order already exists for this sub + date
//             const existing = await DMBDailyOrder.findOne({
//                 subscriptionId: sub._id,
//                 deliveryDate: { $gte: dayStart, $lt: dayEnd }
//             });

//             if (existing) {
//                 skipped++;
//                 continue;
//             }

//             // Build meals snapshot
//             const mealsSnapshot = [];
//             for (const m of (sub.meals || [])) {
//                 const planId = m.mealPlanId?._id || m.mealPlanId;
//                 let displayName = m.mealPlanId?.name || 'Meal';

//                 try {
//                     const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
//                     let dailyMenuItem = await DMBDailyMenu.findOne({
//                         vendorId: sub.vendorId,
//                         mealPlanId: planId,
//                         date: dayStart
//                     });
//                     if (!dailyMenuItem) {
//                         dailyMenuItem = await DMBDailyMenu.findOne({
//                             vendorId: sub.vendorId,
//                             date: dayStart
//                         });
//                     }
//                     if (dailyMenuItem && dailyMenuItem.dishName) {
//                         displayName = dailyMenuItem.dishName;
//                     }
//                 } catch (e) {
//                     logger.warn(`Error resolving daily menu for daily order: ${e.message}`);
//                 }

//                 mealsSnapshot.push({
//                     mealPlanId: planId,
//                     name: displayName,
//                     quantity: m.quantity || 1
//                 });
//             }

//             const totalPrice = (sub.meals || []).reduce((acc, m) => {
//                 const pricePerDay = m.mealPlanId?.pricePerDay || 0;
//                 return acc + (pricePerDay * (m.quantity || 1));
//             }, 0) || sub.pricing?.basePricePerDay || 0;

//             await DMBDailyOrder.create({
//                 subscriptionId: sub._id,
//                 userId: sub.userId,
//                 vendorId: sub.vendorId,
//                 meals: mealsSnapshot,
//                 deliveryDate: dayStart,
//                 deliverySlot: sub.deliverySlot,
//                 status: 'scheduled',
//                 pricing: { totalPrice, currency: 'INR' },
//                 deliveryAddress: sub.deliveryAddress
//             });

//             created++;
//         } catch (err) {
//             logger.warn(`Failed to generate daily order for sub ${sub._id}: ${err.message}`);
//         }
//     }

//     logger.info(`Daily orders for ${dateStr(targetDate)}: created=${created}, skipped=${skipped}`);
//     return { created, skipped, date: dateStr(targetDate) };
// };

// /**
//  * Ensure next 14 days of orders exist for a specific user.
//  * Called lazily when the customer opens HomeScreen / OrdersScreen.
//  * Generates orders for ALL upcoming days so vendor-scheduled meals appear.
//  */
// export const ensureOrdersForUser = async (userId) => {
//     const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js').catch(() => ({ DMBDailyMenu: null }));

//     // Get active subscriptions for this user
//     const subs = await DMBSubscription.find({ userId, status: 'active' })
//         .populate('meals.mealPlanId', 'name pricePerDay')
//         .lean();

//     const today = toDateOnly(new Date());
//     const tomorrow = toDateOnly(new Date(Date.now() + 86400000));

//     for (const sub of subs) {
//         // Collect all target dates to ensure orders exist.
//         // We always ensure today and tomorrow.
//         const targetDates = [today, tomorrow];

//         // Also query DMBDailyMenu for any upcoming customized menus from this vendor
//         if (DMBDailyMenu) {
//             try {
//                 const upcomingCustomMenus = await DMBDailyMenu.find({
//                     vendorId: sub.vendorId,
//                     date: { $gte: today }
//                 }).lean();
//                 for (const menu of upcomingCustomMenus) {
//                     const menuDate = toDateOnly(menu.date);
//                     if (!targetDates.some(d => d.getTime() === menuDate.getTime())) {
//                         targetDates.push(menuDate);
//                     }
//                 }
//             } catch (err) {
//                 logger.warn(`ensureOrdersForUser custom menu query failed: ${err.message}`);
//             }
//         }

//         // Now ensure order exists for each target date
//         for (const targetDate of targetDates) {
//             const dayStart = toDateOnly(targetDate);
//             const dayEnd = new Date(dayStart);
//             dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

//             const dayOfWeek = dayStart.getUTCDay();
//             const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
//             // Skip days not in subscription's delivery schedule
//             if (sub.deliveryDays === 'mon_fri' && !isWeekday) continue;
//             if (dayOfWeek === 0 && sub.deliveryDays !== 'full_week') continue; // Skip Sunday unless it is full_week

//             const existing = await DMBDailyOrder.findOne({
//                 subscriptionId: sub._id,
//                 deliveryDate: { $gte: dayStart, $lt: dayEnd }
//             });

//             if (!existing) {
//                 // Create new order for this day
//                 const mealsSnapshot = [];
//                 for (const m of (sub.meals || [])) {
//                     const planId = m.mealPlanId?._id || m.mealPlanId;
//                     let displayName = m.mealPlanId?.name || 'Meal';

//                     try {
//                         if (DMBDailyMenu) {
//                             let dailyMenuItem = await DMBDailyMenu.findOne({
//                                 vendorId: sub.vendorId,
//                                 mealPlanId: planId,
//                                 date: dayStart
//                             }).lean();
//                             if (!dailyMenuItem) {
//                                 dailyMenuItem = await DMBDailyMenu.findOne({
//                                     vendorId: sub.vendorId,
//                                     date: dayStart
//                                 }).lean();
//                             }
//                             if (dailyMenuItem?.dishName) {
//                                 displayName = dailyMenuItem.dishName;
//                             }
//                         }
//                     } catch (e) { }

//                     mealsSnapshot.push({
//                         mealPlanId: planId,
//                         name: displayName,
//                         quantity: m.quantity || 1
//                     });
//                 }

//                 const totalPrice = (sub.meals || []).reduce((acc, m) => {
//                     return acc + ((m.mealPlanId?.pricePerDay || 0) * (m.quantity || 1));
//                 }, 0) || sub.pricing?.basePricePerDay || 0;

//                 await DMBDailyOrder.create({
//                     subscriptionId: sub._id,
//                     userId: sub.userId,
//                     vendorId: sub.vendorId,
//                     meals: mealsSnapshot,
//                     deliveryDate: dayStart,
//                     deliverySlot: sub.deliverySlot,
//                     status: 'scheduled',
//                     pricing: { totalPrice, currency: 'INR' },
//                     deliveryAddress: sub.deliveryAddress
//                 }).catch(e => logger.warn(`ensureOrdersForUser: ${e.message}`));
//             }
//         }
//     }
// };

// /**
//  * Get today's and tomorrow's meal info for a customer (HomeScreen card)
//  * Always fetches fresh dishName from DMBDailyMenu so vendor changes reflect immediately.
//  */
// export const getTodayAndTomorrowMeals = async (userId) => {
//     await ensureOrdersForUser(userId);

//     const today = toDateOnly(new Date());
//     const tomorrow = toDateOnly(new Date(Date.now() + 86400000));
//     const dayAfterTomorrow = toDateOnly(new Date(Date.now() + 2 * 86400000));

//     // Fetch as mutable documents (NOT lean) so we can update + save if name changed
//     const orderDocs = await DMBDailyOrder.find({
//         userId,
//         deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
//         status: { $nin: ['failed'] }
//     }).sort({ deliveryDate: 1 });

//     // Refresh meal names from latest DMBDailyMenu for each order
//     for (const order of orderDocs) {
//         let dirty = false;
//         if (!order.deliveryPin) {
//             order.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
//             dirty = true;
//         }
//         await refreshMealNameFromDailyMenu(order);
//         if (dirty) {
//             await order.save().catch(err => logger.error(`Error saving generated deliveryPin: ${err.message}`));
//         }
//     }

//     // Now populate for formatting
//     const orders = await DMBDailyOrder.find({
//         userId,
//         deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
//         status: { $nin: ['failed'] }
//     })
//         .populate('vendorId', 'restaurantName profileImage city location')
//         .populate('dispatch.deliveryPartnerId', 'name profilePhoto vehicleType phone')
//         .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
//         .sort({ deliveryDate: 1 })
//         .lean();

//     // Attach custom photo, nutrition, description
//     await attachDailyMenuDetails(orders);

//     const todayOrders = orders.filter(o =>
//         new Date(o.deliveryDate).getTime() === today.getTime()
//     );
//     const tomorrowOrders = orders.filter(o =>
//         new Date(o.deliveryDate).getTime() === tomorrow.getTime()
//     );

//     return {
//         today: todayOrders.length > 0 ? formatOrderCard(todayOrders[0]) : null,
//         tomorrow: tomorrowOrders.length > 0 ? formatOrderCard(tomorrowOrders[0]) : null
//     };
// };

// /**
//  * Get upcoming + past orders for a customer (OrdersScreen)
//  * For upcoming orders, always refreshes dishName from DMBDailyMenu.
//  */
// export const getCustomerOrders = async (userId, { type = 'upcoming' } = {}) => {
//     await ensureOrdersForUser(userId);

//     const today = toDateOnly(new Date());

//     const filter = { userId };
//     if (type === 'upcoming') {
//         filter.deliveryDate = { $gte: today };
//         filter.status = { $nin: ['delivered', 'failed'] };
//     } else {
//         filter.$or = [
//             { deliveryDate: { $lt: today } },
//             { status: { $in: ['delivered', 'failed'] } }
//         ];
//     }

//     // For upcoming orders: refresh meal names from DMBDailyMenu first
//     if (type === 'upcoming') {
//         const orderDocs = await DMBDailyOrder.find(filter)
//             .sort({ deliveryDate: 1 })
//             .limit(50);
//         for (const order of orderDocs) {
//             let dirty = false;
//             if (!order.deliveryPin) {
//                 order.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
//                 dirty = true;
//             }
//             await refreshMealNameFromDailyMenu(order);
//             if (dirty) {
//                 await order.save().catch(err => logger.error(`Error saving generated deliveryPin: ${err.message}`));
//             }
//         }
//     }

//     const orders = await DMBDailyOrder.find(filter)
//         .populate('vendorId', 'restaurantName profileImage city location')
//         .populate('dispatch.deliveryPartnerId', 'name profilePhoto vehicleType phone')
//         .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
//         .populate('subscriptionId', 'deliveryDays')
//         .sort(type === 'upcoming' ? { deliveryDate: 1 } : { deliveryDate: -1 })
//         .limit(50)
//         .lean();

//     // Attach custom photo, nutrition, description
//     await attachDailyMenuDetails(orders);

//     // Resolve order status dynamically before returning
//     const mappedOrders = orders.map(order => {
//         let status = order.status;
//         const deliveryDateOnly = toDateOnly(order.deliveryDate);
//         if (deliveryDateOnly < today) {
//             if (status !== 'delivered' && status !== 'skipped' && status !== 'failed') {
//                 status = 'failed';
//             }
//         }
//         return {
//             ...order,
//             status
//         };
//     });

//     return mappedOrders.map(formatOrderCard);
// };

// /**
//  * Get vendor's daily orders (Vendor OrdersManager)
//  */
// export const getVendorDailyOrders = async (vendorId, { date, slot } = {}) => {
//     const targetDate = date ? toDateOnly(new Date(date)) : toDateOnly(new Date());
//     const nextDay = new Date(targetDate);
//     nextDay.setUTCDate(nextDay.getUTCDate() + 1);

//     const filter = {
//         vendorId,
//         deliveryDate: { $gte: targetDate, $lt: nextDay }
//     };
//     if (slot) filter.deliverySlot = slot;

//     const orders = await DMBDailyOrder.find(filter)
//         .populate('userId', 'name phone')
//         .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
//         .sort({ deliverySlot: 1, createdAt: 1 })
//         .lean();

//     // Attach custom photo, nutrition, description
//     await attachDailyMenuDetails(orders);

//     return orders.map(o => ({
//         _id: o._id,
//         orderId: o.orderId,
//         status: o.status,
//         deliverySlot: o.deliverySlot,
//         deliveryDate: o.deliveryDate,
//         customer: {
//             name: o.userId?.name || 'Customer',
//             phone: o.userId?.phone || ''
//         },
//         meals: o.meals.map(m => ({
//             name: m.name || m.mealPlanId?.name || 'Meal',
//             quantity: m.quantity,
//             photo: m.customPhoto || m.mealPlanId?.photos?.[0] || null,
//             nutrition: m.customNutrition || m.mealPlanId?.nutrition || null,
//             description: m.customDescription || m.mealPlanId?.description || ''
//         })),
//         pricing: o.pricing,
//         deliveryAddress: o.deliveryAddress,
//         collectionPin: o.collectionPin
//     }));
// };

// /**
//  * Vendor updates order status → broadcasts via Socket.IO to customer
//  */
// // ─── Prep Window Validation Helpers ─────────────────────────────────────────
// const isWithinPrepWindow = (slot, date = new Date()) => {
//     const hours = date.getHours();
//     const minutes = date.getMinutes();
//     const timeVal = hours * 60 + minutes; // minutes from midnight

//     if (slot === 'breakfast') {
//         return timeVal >= 4 * 60 + 30 && timeVal <= 6 * 60; // 04:30 to 06:00
//     }
//     if (slot === 'lunch') {
//         return timeVal >= 11 * 60 + 30 && timeVal <= 11 * 60 + 40; // 11:30 to 11:40
//     }
//     if (slot === 'dinner') {
//         return timeVal >= 16 * 60 + 30 && timeVal <= 18 * 60; // 16:30 to 18:00
//     }
//     return false;
// };

// const getLocalDateString = (date) => {
//     const d = new Date(date);
//     const year = d.getFullYear();
//     const month = String(d.getMonth() + 1).padStart(2, '0');
//     const day = String(d.getDate()).padStart(2, '0');
//     return `${year}-${month}-${day}`;
// };

// /**
//  * Triggers driver notification if all orders in a slot are ready.
//  */
// export const triggerDriverNotificationIfAllReady = async (vendorId, date, slot) => {
//     const targetDate = toDateOnly(date);
//     const nextDay = new Date(targetDate);
//     nextDay.setUTCDate(nextDay.getUTCDate() + 1);

//     const filter = {
//         vendorId,
//         deliveryDate: { $gte: targetDate, $lt: nextDay },
//         deliverySlot: slot
//     };

//     const allOrdersInSlot = await DMBDailyOrder.find(filter);
//     if (allOrdersInSlot.length === 0) {
//         logger.info(`No orders found for vendor ${vendorId} in slot ${slot} on ${dateStr(targetDate)}`);
//         return;
//     }

//     // Check if there are any orders still in scheduled or preparing status
//     const pendingOrders = allOrdersInSlot.filter(o => ['scheduled', 'preparing'].includes(o.status));
//     if (pendingOrders.length > 0) {
//         logger.info(`Cannot notify driver: there are still ${pendingOrders.length} pending orders for vendor ${vendorId} in slot ${slot} on ${dateStr(targetDate)}`);
//         return;
//     }

//     // Check if there are ready orders to collect
//     const readyOrders = allOrdersInSlot.filter(o => o.status === 'ready');
//     if (readyOrders.length === 0) {
//         logger.info(`All orders processed for vendor ${vendorId} in slot ${slot} on ${dateStr(targetDate)}, but none are 'ready' (all might be skipped).`);
//         return;
//     }

//     try {
//         const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName location zoneId serviceZone city phone');
//         const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
//         const vendorCity = vendor?.city || vendor?.location?.city;

//         const driverFilter = {
//             availabilityStatus: 'online',
//             status: 'approved',
//         };

//         if (vendorZoneId) {
//             driverFilter.$or = [
//                 { zoneIds: vendorZoneId },
//                 { city: { $regex: new RegExp(`^${vendorCity}$`, 'i') } }
//             ];
//         } else if (vendorCity) {
//             driverFilter.city = { $regex: new RegExp(`^${vendorCity}$`, 'i') };
//         } else {
//             logger.warn(`Vendor ${vendorId} has no zoneId or city configured. Cannot broadcast.`);
//             return;
//         }

//         // Find existing batch or create a new one
//         let batch = await CollectionBatch.findOne({
//             vendorId,
//             deliveryDate: targetDate,
//             deliverySlot: slot
//         });

//         if (batch && batch.status !== 'pending') {
//             logger.info(`Batch ${batch.batchId} status is ${batch.status}, not broadcasting again.`);
//             return;
//         }

//         if (!batch) {
//             const pin = String(Math.floor(1000 + crypto.randomInt(9000))).padStart(4, '0');
//             batch = await CollectionBatch.create({
//                 vendorId,
//                 deliveryDate: targetDate,
//                 deliverySlot: slot,
//                 collectionPinHash: pin, // Store raw 4-digit PIN for verification
//                 boxCount: readyOrders.length,
//                 orderIds: readyOrders.map(o => o._id),
//                 status: 'pending'
//             });
//         } else {
//             batch.boxCount = readyOrders.length;
//             batch.orderIds = readyOrders.map(o => o._id);
//             await batch.save();
//         }

//         const onlineDrivers = await FoodDeliveryPartner.find(driverFilter).select('_id fcmTokens socketRoomId');
//         logger.info(`Vendor ${vendorId} automatic broadcast query matched ${onlineDrivers.length} online drivers`);

//         const io = getIO();
//         if (io && onlineDrivers.length > 0) {
//             const payload = {
//                 batchId: batch.batchId,
//                 slotType: slot,
//                 totalMealBoxCount: batch.boxCount,
//                 vendorInfo: {
//                     vendorId: vendor._id,
//                     vendorName: vendor.restaurantName,
//                     vendorLocation: vendor.location,
//                     vendorPhone: vendor.phone || ''
//                 },
//                 pickupStatus: batch.status,

//                 // Backward compatibility
//                 vendorId: vendor._id,
//                 vendorName: vendor.restaurantName,
//                 vendorLocation: vendor.location,
//                 boxCount: batch.boxCount,
//                 slot: slot,
//                 totalOrders: batch.boxCount
//             };

//             onlineDrivers.forEach(driver => {
//                 const roomName = `delivery:${driver._id.toString()}`;
//                 io.to(roomName).emit('new_delivery_request', payload);
//             });

//             logger.info(`Automatic notification for vendor ${vendorId} slot ${slot} batch ${batch.batchId} broadcasted to ${onlineDrivers.length} drivers`);
//         }
//     } catch (err) {
//         logger.error(`Error in triggerDriverNotificationIfAllReady: ${err.message}`);
//     }
// };

// export const notifyDriverOfRouteUpdate = (driverId) => {
//     try {
//         const io = getIO();
//         if (io && driverId) {
//             io.to(`delivery:${driverId.toString()}`).emit('order_status_update', {
//                 timestamp: Date.now(),
//                 message: 'Route updated'
//             });
//             logger.info(`Socket emitted order_status_update to driver ${driverId}`);
//         }
//     } catch (err) {
//         logger.warn(`Failed to notify driver of route update: ${err.message}`);
//     }
// };

// /**
//  * Vendor updates order status → broadcasts via Socket.IO to customer
//  */
// export const updateDailyOrderStatus = async (orderId, status, vendorId) => {
//     const validTransitions = {
//         scheduled: ['preparing', 'skipped'],
//         preparing: ['ready'],
//         ready: ['out_for_delivery'],
//         out_for_delivery: ['delivered'],
//         delivered: [],
//         skipped: [],
//         failed: []
//     };

//     const order = await DMBDailyOrder.findOne({ _id: orderId, vendorId });
//     if (!order) throw new Error('Order not found or not authorized');

//     /* For testing: Timing restrictions commented out
//     if (status === 'preparing') {
//         const orderDateStr = getLocalDateString(order.deliveryDate);
//         const todayStr = getLocalDateString(new Date());

//         if (orderDateStr !== todayStr) {
//             throw new Error('Can only start preparation for today\'s orders');
//         }

//         if (!isWithinPrepWindow(order.deliverySlot)) {
//             let windowText = '';
//             if (order.deliverySlot === 'breakfast') windowText = '4:30 AM – 6:00 AM';
//             else if (order.deliverySlot === 'lunch') windowText = '11:30 AM – 11:40 AM';
//             else if (order.deliverySlot === 'dinner') windowText = '4:30 PM – 6:00 PM';
//             throw new Error(`Cannot start preparation for ${order.deliverySlot} outside its configured preparation window (${windowText})`);
//         }
//     }
//     */

//     const allowed = validTransitions[order.status] || [];
//     if (!allowed.includes(status)) {
//         throw new Error(`Cannot transition from ${order.status} to ${status}`);
//     }

//     // Set timestamps
//     if (status === 'preparing') order.preparingAt = new Date();
//     if (status === 'ready') order.readyAt = new Date();
//     if (status === 'out_for_delivery') order.pickedUpAt = new Date();
//     if (status === 'delivered') order.deliveredAt = new Date();

//     order.status = status;
//     await order.save();

//     // Real-time: emit to customer's subscription room
//     const io = getIO();
//     if (io) {
//         const roomName = `sub_${order.subscriptionId}`;
//         io.to(roomName).emit('order_status_updated', {
//             orderId: order.orderId,
//             _id: order._id,
//             status: order.status,
//             deliveryDate: order.deliveryDate,
//             deliverySlot: order.deliverySlot,
//             updatedAt: new Date().toISOString()
//         });
//         logger.info(`Socket emitted order_status_updated to room ${roomName}: ${status}`);
//     }

//     // Trigger driver notification if all orders in this slot are ready
//     if (status === 'ready') {
//         await triggerDriverNotificationIfAllReady(order.vendorId, order.deliveryDate, order.deliverySlot);
//     }

//     if (order.dispatch?.deliveryPartnerId) {
//         notifyDriverOfRouteUpdate(order.dispatch.deliveryPartnerId);
//     }

//     logger.info(`DMB order ${order.orderId} status → ${status} by vendor ${vendorId}`);
//     return order;
// };

// /**
//  * Batch: Vendor marks all orders for a slot as "ready"
//  */
// export const markAllOrdersReady = async (vendorId, { date, slot }) => {
//     const targetDate = toDateOnly(date ? new Date(date) : new Date());
//     const nextDay = new Date(targetDate);
//     nextDay.setUTCDate(nextDay.getUTCDate() + 1);

//     const filter = {
//         vendorId,
//         deliveryDate: { $gte: targetDate, $lt: nextDay },
//         status: { $in: ['scheduled', 'preparing'] }
//     };
//     if (slot) filter.deliverySlot = slot;

//     const orders = await DMBDailyOrder.find(filter);
//     if (orders.length === 0) {
//         return { count: 0, date: dateStr(targetDate), slot, message: 'No pending orders found' };
//     }

//     const io = getIO();
//     let count = 0;

//     for (const order of orders) {
//         order.status = 'ready';
//         order.readyAt = new Date();
//         await order.save();
//         count++;

//         // Notify each subscriber
//         if (io) {
//             io.to(`sub_${order.subscriptionId}`).emit('order_status_updated', {
//                 orderId: order.orderId,
//                 _id: order._id,
//                 status: 'ready',
//                 deliveryDate: order.deliveryDate,
//                 deliverySlot: order.deliverySlot,
//                 updatedAt: new Date().toISOString()
//             });
//         }

//         if (order.dispatch?.deliveryPartnerId) {
//             notifyDriverOfRouteUpdate(order.dispatch.deliveryPartnerId);
//         }
//     }

//     // Automatically trigger driver notification if all slot meals are ready
//     await triggerDriverNotificationIfAllReady(vendorId, targetDate, slot || 'lunch');

//     logger.info(`Vendor ${vendorId} marked ${count} orders as ready for ${dateStr(targetDate)} / ${slot}`);
//     return { count, date: dateStr(targetDate), slot };
// };

// // ─── Internal Formatter ────────────────────────────────────────────────────
// // Priority: m.name (vendor-set custom dishName) > mealPlanId.name (default plan name)
// const formatOrderCard = (order) => ({
//     _id: order._id,
//     orderId: order.orderId,
//     status: order.status,
//     deliveryDate: order.deliveryDate,
//     deliverySlot: order.deliverySlot,
//     vendor: {
//         name: order.vendorId?.restaurantName || 'Vendor',
//         image: order.vendorId?.profileImage || null,
//         city: order.vendorId?.city || '',
//         location: order.vendorId?.location || null
//     },
//     meals: (order.meals || []).map(m => ({
//         // ✅ FIX: m.name (custom dishName from vendor) FIRST, then default plan name
//         name: m.name || m.mealPlanId?.name || 'Meal',
//         photo: m.customPhoto || m.mealPlanId?.photos?.[0] || null,
//         nutrition: m.customNutrition || m.mealPlanId?.nutrition || null,
//         description: m.customDescription || m.mealPlanId?.description || '',
//         quantity: m.quantity
//     })),
//     pricing: order.pricing,
//     subscriptionId: order.subscriptionId,
//     deliveryPin: order.deliveryPin || '',
//     deliveryAddress: order.deliveryAddress,
//     dispatch: order.dispatch ? {
//         deliveryPartner: order.dispatch.deliveryPartnerId ? {
//             _id: order.dispatch.deliveryPartnerId._id,
//             name: order.dispatch.deliveryPartnerId.name,
//             profilePhoto: order.dispatch.deliveryPartnerId.profilePhoto,
//             vehicleType: order.dispatch.deliveryPartnerId.vehicleType,
//             phone: order.dispatch.deliveryPartnerId.phone
//         } : null
//     } : null
// });





// cloud code
import { DMBDailyOrder } from './dmb.dailyOrder.model.js';
import { DMBSubscription } from './subscription.model.js';
import { DMBMealPlan } from '../mealplan/mealPlan.model.js';
import { CollectionBatch } from '../delivery/collectionBatch.model.js';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../food/delivery/models/deliveryPartner.model.js';
import { getIO } from '../../../config/socket.js';
import { logger } from '../../../utils/logger.js';
import crypto from 'crypto';

/**
 * DMB Daily Orders Service
 * Handles creation and management of per-day delivery instances
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────
const toDateOnly = (date) => {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    return d;
};

const dateStr = (date) => new Date(date).toISOString().split('T')[0];

// ─── Helper: Fetch fresh dishName from DMBDailyMenu & update order if needed ──
const refreshMealNameFromDailyMenu = async (order) => {
    try {
        const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
        const dayStart = toDateOnly(new Date(order.deliveryDate));
        let updated = false;

        for (const m of order.meals) {
            const planId = m.mealPlanId?._id || m.mealPlanId;
            if (!planId) continue;
            try {
                let dailyMenuItem = await DMBDailyMenu.findOne({
                    vendorId: order.vendorId,
                    mealPlanId: planId,
                    date: dayStart,
                    slot: order.deliverySlot
                }).lean();
                if (!dailyMenuItem) {
                    dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: order.vendorId,
                        date: dayStart,
                        slot: order.deliverySlot
                    }).lean();
                }
                if (dailyMenuItem?.dishName && m.name !== dailyMenuItem.dishName) {
                    m.name = dailyMenuItem.dishName;
                    updated = true;
                }
            } catch (e) { /* ignore */ }
        }

        if (updated) {
            await DMBDailyOrder.updateOne({ _id: order._id }, { $set: { meals: order.meals } });
        }
    } catch (e) {
        // silently ignore import errors
    }
    return order;
};

// ─── Helper: Fetch and attach custom daily menu details (photo, nutrition) ──
const attachDailyMenuDetails = async (orders) => {
    try {
        const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
        const ordersArray = Array.isArray(orders) ? orders : [orders];
        for (const order of ordersArray) {
            const dayStart = toDateOnly(new Date(order.deliveryDate));
            for (const m of (order.meals || [])) {
                const planId = m.mealPlanId?._id || m.mealPlanId;
                let dailyMenuItem = null;
                if (planId) {
                    dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: order.vendorId?._id || order.vendorId,
                        mealPlanId: planId,
                        date: dayStart,
                        slot: order.deliverySlot
                    }).lean();
                }
                if (!dailyMenuItem) {
                    dailyMenuItem = await DMBDailyMenu.findOne({
                        vendorId: order.vendorId?._id || order.vendorId,
                        date: dayStart,
                        slot: order.deliverySlot
                    }).lean();
                }
                if (dailyMenuItem) {
                    if (dailyMenuItem.dishName) m.name = dailyMenuItem.dishName;
                    if (dailyMenuItem.photo) m.customPhoto = dailyMenuItem.photo;
                    if (dailyMenuItem.nutrition) m.customNutrition = dailyMenuItem.nutrition;
                    if (dailyMenuItem.description) m.customDescription = dailyMenuItem.description;
                }
            }
        }
    } catch (e) {
        // silently ignore
    }
    return orders;
};


/**
 * Generate DMBDailyOrder records for all active subscriptions on a given date.
 */
export const generateDailyOrdersForDate = async (targetDate = new Date()) => {
    const dayStart = toDateOnly(targetDate);
    const dayEnd = new Date(dayStart);
    dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

    const dayOfWeek = dayStart.getUTCDay();

    const activeSubscriptions = await DMBSubscription.find({ status: 'active' })
        .populate('meals.mealPlanId', 'name pricePerDay')
        .lean();

    let created = 0;
    let skipped = 0;

    for (const sub of activeSubscriptions) {
        try {
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            const isMonFri = sub.deliveryDays === 'mon_fri';

            if (isMonFri && !isWeekday) {
                skipped++;
                continue;
            }

            const slots = sub.deliverySlots && sub.deliverySlots.length > 0
                ? sub.deliverySlots
                : (sub.deliverySlot ? [sub.deliverySlot] : ['lunch']);

            for (const slot of slots) {
                const existing = await DMBDailyOrder.findOne({
                    subscriptionId: sub._id,
                    deliveryDate: { $gte: dayStart, $lt: dayEnd },
                    deliverySlot: slot
                });

                if (existing) {
                    skipped++;
                    continue;
                }

                const mealsSnapshot = [];
                for (const m of (sub.meals || [])) {
                    const planId = m.mealPlanId?._id || m.mealPlanId;
                    let displayName = m.mealPlanId?.name || 'Meal';

                    try {
                        const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
                        let dailyMenuItem = await DMBDailyMenu.findOne({
                            vendorId: sub.vendorId,
                            mealPlanId: planId,
                            date: dayStart
                        });
                        if (!dailyMenuItem) {
                            dailyMenuItem = await DMBDailyMenu.findOne({
                                vendorId: sub.vendorId,
                                date: dayStart
                            });
                        }
                        if (dailyMenuItem && dailyMenuItem.dishName) {
                            displayName = dailyMenuItem.dishName;
                        }
                    } catch (e) {
                        logger.warn(`Error resolving daily menu for daily order: ${e.message}`);
                    }

                    mealsSnapshot.push({
                        mealPlanId: planId,
                        name: displayName,
                        quantity: m.quantity || 1
                    });
                }

                const totalPrice = (sub.meals || []).reduce((acc, m) => {
                    const pricePerDay = m.mealPlanId?.pricePerDay || 0;
                    return acc + (pricePerDay * (m.quantity || 1));
                }, 0) || sub.pricing?.basePricePerDay || 0;

                await DMBDailyOrder.create({
                    subscriptionId: sub._id,
                    userId: sub.userId,
                    vendorId: sub.vendorId,
                    meals: mealsSnapshot,
                    deliveryDate: dayStart,
                    deliverySlot: slot,
                    status: 'scheduled',
                    pricing: { totalPrice, currency: 'INR' },
                    deliveryAddress: sub.deliveryAddress
                });

                created++;
            }
        } catch (err) {
            logger.warn(`Failed to generate daily order for sub ${sub._id}: ${err.message}`);
        }
    }

    logger.info(`Daily orders for ${dateStr(targetDate)}: created=${created}, skipped=${skipped}`);
    return { created, skipped, date: dateStr(targetDate) };
};

/**
 * Ensure next 14 days of orders exist for a specific user.
 */
export const ensureOrdersForUser = async (userId) => {
    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js').catch(() => ({ DMBDailyMenu: null }));

    const subs = await DMBSubscription.find({ userId, status: 'active' })
        .populate('meals.mealPlanId', 'name pricePerDay')
        .lean();

    const today = toDateOnly(new Date());
    const tomorrow = toDateOnly(new Date(Date.now() + 86400000));

    for (const sub of subs) {
        const targetDates = [today, tomorrow];

        if (DMBDailyMenu) {
            try {
                const upcomingCustomMenus = await DMBDailyMenu.find({
                    vendorId: sub.vendorId,
                    date: { $gte: today }
                }).lean();
                for (const menu of upcomingCustomMenus) {
                    const menuDate = toDateOnly(menu.date);
                    if (!targetDates.some(d => d.getTime() === menuDate.getTime())) {
                        targetDates.push(menuDate);
                    }
                }
            } catch (err) {
                logger.warn(`ensureOrdersForUser custom menu query failed: ${err.message}`);
            }
        }

        for (const targetDate of targetDates) {
            const dayStart = toDateOnly(targetDate);
            const dayEnd = new Date(dayStart);
            dayEnd.setUTCDate(dayEnd.getUTCDate() + 1);

            const dayOfWeek = dayStart.getUTCDay();
            const isWeekday = dayOfWeek >= 1 && dayOfWeek <= 5;
            if (sub.deliveryDays === 'mon_fri' && !isWeekday) continue;
            if (dayOfWeek === 0 && sub.deliveryDays !== 'full_week') continue;

            const slots = sub.deliverySlots && sub.deliverySlots.length > 0
                ? sub.deliverySlots
                : (sub.deliverySlot ? [sub.deliverySlot] : ['lunch']);

            for (const slot of slots) {
                const existing = await DMBDailyOrder.findOne({
                    subscriptionId: sub._id,
                    deliveryDate: { $gte: dayStart, $lt: dayEnd },
                    deliverySlot: slot
                });

                if (!existing) {
                    const mealsSnapshot = [];
                    for (const m of (sub.meals || [])) {
                        const planId = m.mealPlanId?._id || m.mealPlanId;
                        let displayName = m.mealPlanId?.name || 'Meal';

                        try {
                            if (DMBDailyMenu) {
                                let dailyMenuItem = await DMBDailyMenu.findOne({
                                    vendorId: sub.vendorId,
                                    mealPlanId: planId,
                                    date: dayStart
                                }).lean();
                                if (!dailyMenuItem) {
                                    dailyMenuItem = await DMBDailyMenu.findOne({
                                        vendorId: sub.vendorId,
                                        date: dayStart
                                    }).lean();
                                }
                                if (dailyMenuItem?.dishName) {
                                    displayName = dailyMenuItem.dishName;
                                }
                            }
                        } catch (e) { }

                        mealsSnapshot.push({
                            mealPlanId: planId,
                            name: displayName,
                            quantity: m.quantity || 1
                        });
                    }

                    const totalPrice = (sub.meals || []).reduce((acc, m) => {
                        return acc + ((m.mealPlanId?.pricePerDay || 0) * (m.quantity || 1));
                    }, 0) || sub.pricing?.basePricePerDay || 0;

                    await DMBDailyOrder.create({
                        subscriptionId: sub._id,
                        userId: sub.userId,
                        vendorId: sub.vendorId,
                        meals: mealsSnapshot,
                        deliveryDate: dayStart,
                        deliverySlot: slot,
                        status: 'scheduled',
                        pricing: { totalPrice, currency: 'INR' },
                        deliveryAddress: sub.deliveryAddress
                    }).catch(e => logger.warn(`ensureOrdersForUser: ${e.message}`));
                }
            }
        }
    }
};

/**
 * Get today's and tomorrow's meal info for a customer (HomeScreen card)
 */
export const getTodayAndTomorrowMeals = async (userId) => {
    await ensureOrdersForUser(userId);

    const today = toDateOnly(new Date());
    const tomorrow = toDateOnly(new Date(Date.now() + 86400000));
    const dayAfterTomorrow = toDateOnly(new Date(Date.now() + 2 * 86400000));

    const orderDocs = await DMBDailyOrder.find({
        userId,
        deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
        status: { $nin: ['failed'] }
    }).sort({ deliveryDate: 1 });

    for (const order of orderDocs) {
        let dirty = false;
        if (!order.deliveryPin) {
            order.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
            dirty = true;
        }
        await refreshMealNameFromDailyMenu(order);
        if (dirty) {
            await order.save().catch(err => logger.error(`Error saving generated deliveryPin: ${err.message}`));
        }
    }

    const orders = await DMBDailyOrder.find({
        userId,
        deliveryDate: { $gte: today, $lt: dayAfterTomorrow },
        status: { $nin: ['failed'] }
    })
        .populate('vendorId', 'restaurantName profileImage city location')
        .populate('dispatch.deliveryPartnerId', 'name profilePhoto vehicleType phone')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .lean();

    const slotPriority = { breakfast: 1, lunch: 2, dinner: 3 };
    orders.sort((a, b) => {
        const dateA = new Date(a.deliveryDate).getTime();
        const dateB = new Date(b.deliveryDate).getTime();
        if (dateA !== dateB) return dateA - dateB;
        const priorityA = slotPriority[a.deliverySlot] || 99;
        const priorityB = slotPriority[b.deliverySlot] || 99;
        return priorityA - priorityB;
    });

    await attachDailyMenuDetails(orders);

    const todayOrders = orders.filter(o =>
        new Date(o.deliveryDate).getTime() === today.getTime()
    );
    const tomorrowOrders = orders.filter(o =>
        new Date(o.deliveryDate).getTime() === tomorrow.getTime()
    );

    return {
        today: todayOrders.length > 0 ? formatOrderCard(todayOrders.find(o => !['delivered', 'skipped', 'failed'].includes(o.status)) || todayOrders[todayOrders.length - 1]) : null,
        tomorrow: tomorrowOrders.length > 0 ? formatOrderCard(tomorrowOrders.find(o => !['delivered', 'skipped', 'failed'].includes(o.status)) || tomorrowOrders[0]) : null
    };
};

/**
 * Get upcoming + past orders for a customer (OrdersScreen)
 */
export const getCustomerOrders = async (userId, { type = 'upcoming' } = {}) => {
    await ensureOrdersForUser(userId);

    const today = toDateOnly(new Date());

    const filter = { userId };
    if (type === 'upcoming') {
        filter.deliveryDate = { $gte: today };
        filter.status = { $nin: ['delivered', 'failed'] };
    } else {
        filter.$or = [
            { deliveryDate: { $lt: today } },
            { status: { $in: ['delivered', 'failed'] } }
        ];
    }

    if (type === 'upcoming') {
        const orderDocs = await DMBDailyOrder.find(filter)
            .sort({ deliveryDate: 1 })
            .limit(50);
        for (const order of orderDocs) {
            let dirty = false;
            if (!order.deliveryPin) {
                order.deliveryPin = String(Math.floor(1000 + Math.random() * 9000));
                dirty = true;
            }
            await refreshMealNameFromDailyMenu(order);
            if (dirty) {
                await order.save().catch(err => logger.error(`Error saving generated deliveryPin: ${err.message}`));
            }
        }
    }

    const orders = await DMBDailyOrder.find(filter)
        .populate('vendorId', 'restaurantName profileImage city location')
        .populate('dispatch.deliveryPartnerId', 'name profilePhoto vehicleType phone')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .populate('subscriptionId', 'deliveryDays')
        .sort(type === 'upcoming' ? { deliveryDate: 1 } : { deliveryDate: -1 })
        .limit(50)
        .lean();

    await attachDailyMenuDetails(orders);

    const mappedOrders = orders.map(order => {
        let status = order.status;
        const deliveryDateOnly = toDateOnly(order.deliveryDate);
        if (deliveryDateOnly < today) {
            if (status !== 'delivered' && status !== 'skipped' && status !== 'failed') {
                status = 'failed';
            }
        }
        return { ...order, status };
    });

    return mappedOrders.map(formatOrderCard);
};

/**
 * Get vendor's daily orders (Vendor OrdersManager)
 */
export const getVendorDailyOrders = async (vendorId, { date, slot } = {}) => {
    const targetDate = date ? toDateOnly(new Date(date)) : toDateOnly(new Date());
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const filter = {
        vendorId,
        deliveryDate: { $gte: targetDate, $lt: nextDay }
    };
    if (slot) filter.deliverySlot = slot;

    const orders = await DMBDailyOrder.find(filter)
        .populate('userId', 'name phone')
        .populate('meals.mealPlanId', 'name photos pricePerDay nutrition')
        .sort({ deliverySlot: 1, createdAt: 1 })
        .lean();

    await attachDailyMenuDetails(orders);

    return orders.map(o => ({
        _id: o._id,
        orderId: o.orderId,
        status: o.status,
        deliverySlot: o.deliverySlot,
        deliveryDate: o.deliveryDate,
        customer: {
            name: o.userId?.name || 'Customer',
            phone: o.userId?.phone || ''
        },
        meals: o.meals.map(m => ({
            name: m.name || m.mealPlanId?.name || 'Meal',
            quantity: m.quantity,
            photo: m.customPhoto || m.mealPlanId?.photos?.[0] || null,
            nutrition: m.customNutrition || m.mealPlanId?.nutrition || null,
            description: m.customDescription || m.mealPlanId?.description || ''
        })),
        pricing: o.pricing,
        deliveryAddress: o.deliveryAddress,
        collectionPin: o.collectionPin
    }));
};

// ─── Prep Window Validation Helpers ─────────────────────────────────────────
// Converts "HH:MM" string to minutes-since-midnight
const hhmmToMinutes = (str) => {
    if (!str) return null;
    const [h, m] = str.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
};

/**
 * Checks whether the current server time falls inside the admin-configured
 * prep window for the given slot.  Returns { allowed: bool, message: string }.
 */
export const checkAdminTimingWindow = async (slot) => {
    try {
        const { getVendorTimingSettings } = await import('../../food/admin/services/admin.service.js');
        const timing = await getVendorTimingSettings();
        const slotCfg = timing[slot];

        if (!slotCfg) return { allowed: true }; // unknown slot → don't block
        if (slotCfg.isEnabled === false) return { allowed: true }; // slot timing disabled → no restriction

        const now = new Date();
        const curMinutes = now.getHours() * 60 + now.getMinutes();
        const start = hhmmToMinutes(slotCfg.startTime);
        const end   = hhmmToMinutes(slotCfg.endTime);

        if (start === null || end === null) return { allowed: true };

        if (curMinutes >= start && curMinutes <= end) {
            return { allowed: true };
        }

        // Format human-friendly window
        const fmt = (mins) => {
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            const ampm = h < 12 ? 'AM' : 'PM';
            const h12 = h % 12 || 12;
            return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
        };
        const slotLabel = slot.charAt(0).toUpperCase() + slot.slice(1);
        return {
            allowed: false,
            message: `⏰ ${slotLabel} preparation is only allowed between ${fmt(start)} and ${fmt(end)}. Current time is outside this window.`
        };
    } catch (err) {
        logger.warn(`[TIMING] Failed to fetch vendor timing settings: ${err.message}`);
        return { allowed: true }; // fail-open so backend issues don't break vendor ops
    }
};

const getLocalDateString = (date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

// ─── FIX 1: Build a robust driver filter that handles missing city/zone ──────
const buildDriverFilter = (vendor) => {
    const baseFilter = {
        availabilityStatus: 'online',
        status: 'approved'
    };

    const vendorZoneId = vendor?.zoneId || vendor?.serviceZone;
    // Normalize city — trim whitespace, handle multiple fields
    const vendorCity = (vendor?.city || vendor?.location?.city || '').trim();

    if (!vendorZoneId && !vendorCity) {
        // FIX: If vendor has no zone/city, log a clear warning but still
        // attempt to match ALL online approved drivers as a fallback
        // instead of returning early with zero results.
        logger.warn(`Vendor ${vendor?._id} has no zoneId or city — broadcasting to ALL online drivers as fallback`);
        return baseFilter; // no location filter → matches all online drivers
    }

    const locationConditions = [];

    if (vendorZoneId) {
        locationConditions.push({ zoneIds: vendorZoneId });
        locationConditions.push({ zoneIds: vendorZoneId.toString() }); // handle ObjectId vs string mismatch
    }

    if (vendorCity) {
        // FIX: also match on driver's location.city in case city is nested
        locationConditions.push({ city: { $regex: new RegExp(`^${vendorCity}$`, 'i') } });
        locationConditions.push({ 'location.city': { $regex: new RegExp(`^${vendorCity}$`, 'i') } });
    }

    return {
        ...baseFilter,
        $or: locationConditions
    };
};

/**
 * Helper to check if vendor has pending/undelivered orders from previous batches or slots
 */
async function checkPendingDeliveriesForVendor(vendorId, requestedSlot, targetDate) {
    // Find all batches for this vendor
    const batches = await CollectionBatch.find({ vendorId });

    for (const batch of batches) {
        if (!batch.orderIds || batch.orderIds.length === 0) continue;

        // Skip if it is the current slot's batch that hasn't been collected yet
        const isSameSlotAndDate = batch.deliverySlot === requestedSlot && 
            new Date(batch.deliveryDate).getTime() === new Date(targetDate).getTime();

        if (isSameSlotAndDate && ['pending', 'driver_assigned'].includes(batch.status)) {
            continue;
        }

        // Check the orders in this batch
        const orders = await DMBDailyOrder.find({ _id: { $in: batch.orderIds } });
        const hasPendingOrders = orders.some(order => !['delivered', 'skipped', 'failed'].includes(order.status));

        if (hasPendingOrders) {
            return {
                hasPending: true,
                batchId: batch.batchId,
                slot: batch.deliverySlot,
                date: batch.deliveryDate
            };
        }
    }

    return { hasPending: false };
}

/**
 * FIX 2: triggerDriverNotificationIfAllReady — robust driver matching + detailed logs
 */
export const triggerDriverNotificationIfAllReady = async (vendorId, date, slot) => {
    const targetDate = toDateOnly(date);
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const filter = {
        vendorId,
        deliveryDate: { $gte: targetDate, $lt: nextDay },
        deliverySlot: slot
    };

    const allOrdersInSlot = await DMBDailyOrder.find(filter).populate('userId', 'name phone');
    if (allOrdersInSlot.length === 0) {
        logger.info(`[DRIVER-NOTIFY] No orders for vendor ${vendorId} slot ${slot} on ${dateStr(targetDate)}`);
        return;
    }

    const pendingOrders = allOrdersInSlot.filter(o => ['scheduled', 'preparing'].includes(o.status));
    if (pendingOrders.length > 0) {
        logger.info(`[DRIVER-NOTIFY] ${pendingOrders.length} orders still pending for vendor ${vendorId} slot ${slot} — skipping broadcast`);
        return;
    }

    const readyOrders = allOrdersInSlot.filter(o => o.status === 'ready');
    if (readyOrders.length === 0) {
        logger.info(`[DRIVER-NOTIFY] No ready orders for vendor ${vendorId} slot ${slot} — all may be skipped`);
        return;
    }

    try {
        const vendor = await FoodRestaurant.findById(vendorId)
            .select('restaurantName location zoneId serviceZone city phone addressLine1');

        // FIX: log vendor details so we can debug city/zone issues easily
        logger.info(`[DRIVER-NOTIFY] Vendor details — city: "${vendor?.city}", location.city: "${vendor?.location?.city}", zoneId: "${vendor?.zoneId}"`);

        // Find existing batch or create a new one
        let batch = await CollectionBatch.findOne({
            vendorId,
            deliveryDate: targetDate,
            deliverySlot: slot
        });

        if (batch && batch.status !== 'pending') {
            logger.info(`[DRIVER-NOTIFY] Batch ${batch.batchId} already has status "${batch.status}" — skipping re-broadcast`);
            return;
        }

        if (!batch) {
            const pendingCheck = await checkPendingDeliveriesForVendor(vendorId, slot, targetDate);
            if (pendingCheck.hasPending) {
                logger.info(`[DRIVER-NOTIFY] New collection PIN cannot be generated for vendor ${vendorId} slot ${slot} because slot ${pendingCheck.slot} still has pending deliveries.`);
                return;
            }

            const pin = String(Math.floor(1000 + crypto.randomInt(9000))).padStart(4, '0');
            batch = await CollectionBatch.create({
                vendorId,
                deliveryDate: targetDate,
                deliverySlot: slot,
                collectionPinHash: pin,
                boxCount: readyOrders.length,
                orderIds: readyOrders.map(o => o._id),
                status: 'pending'
            });
        } else {
            batch.boxCount = readyOrders.length;
            batch.orderIds = readyOrders.map(o => o._id);
            await batch.save();
        }

        // FIX: use the robust driver filter
        const driverFilter = buildDriverFilter(vendor);
        let onlineDrivers = await FoodDeliveryPartner.find(driverFilter)
            .select('_id fcmTokens socketRoomId name phone profilePhoto vehicleNumber lastLat lastLng lastLocationAt availabilityStatus');

        logger.info(`[DRIVER-NOTIFY] Driver query matched ${onlineDrivers.length} online drivers for vendor ${vendorId}`);

        // FIX: log each driver's _id so we can confirm they exist and are online
        if (onlineDrivers.length === 0) {
            logger.warn(`[DRIVER-NOTIFY] Zero drivers matched. Filter used: ${JSON.stringify(driverFilter)}`);
            // FIX: as last-resort fallback, fetch ANY online approved driver in the system
            const fallbackDrivers = await FoodDeliveryPartner.find({
                availabilityStatus: 'online',
                status: 'approved'
            }).select('_id fcmTokens socketRoomId name phone profilePhoto vehicleNumber lastLat lastLng lastLocationAt availabilityStatus').limit(50);
            logger.warn(`[DRIVER-NOTIFY] Fallback: found ${fallbackDrivers.length} total online drivers in system`);
            onlineDrivers = fallbackDrivers;
        }

        const io = getIO();
        if (!io) {
            logger.error(`[DRIVER-NOTIFY] Socket.IO instance not available — cannot emit`);
            return;
        }

        // Emit batch accepted/ready event directly to vendor room in real-time
        const matchedDriver = onlineDrivers.length > 0 ? onlineDrivers[0] : null;
        io.to(`vendor_${vendorId}`).emit('batch_accepted', {
            batchId: batch.batchId,
            driver: matchedDriver ? {
                _id: matchedDriver._id,
                name: matchedDriver.name,
                phone: matchedDriver.phone,
                vehicleNumber: matchedDriver.vehicleNumber,
                profilePhoto: matchedDriver.profilePhoto
            } : null,
            otp: batch.collectionPinHash,
            boxCount: batch.boxCount,
            slot: slot
        });
        logger.info(`[DRIVER-NOTIFY] Emitted batch_accepted to vendor_${vendorId} with OTP/PIN ${batch.collectionPinHash}`);


        if (onlineDrivers.length > 0) {
            const ordersDetails = readyOrders.map(o => ({
                _id: o._id,
                orderId: o.orderId,
                status: o.status,
                deliveryAddress: o.deliveryAddress,
                meals: o.meals,
                customer: {
                    name: o.userId?.name || 'Customer',
                    phone: o.userId?.phone || ''
                },
                pricing: o.pricing
            }));

            let feePerOrder = 18; // fallback default
            try {
                const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
                const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
                if (feeConfig && Number(feeConfig.feePerOrder) > 0) {
                    feePerOrder = Number(feeConfig.feePerOrder);
                }
            } catch (feeErr) {
                logger.error(`[DRIVER-NOTIFY] Failed to fetch fee settings: ${feeErr.message}`);
            }
            const totalEarnings = feePerOrder * batch.boxCount;

            const payload = {
                batchId: batch.batchId,
                slotType: slot,
                totalMealBoxCount: batch.boxCount,
                vendorInfo: {
                    vendorId: vendor._id,
                    vendorName: vendor.restaurantName,
                    vendorLocation: vendor.location,
                    vendorAddress: vendor.addressLine1 || '',
                    vendorPhone: vendor.phone || ''
                },
                pickupStatus: batch.status,
                orders: ordersDetails,
                totalEarnings: totalEarnings,
                // backward compat
                vendorId: vendor._id,
                vendorName: vendor.restaurantName,
                vendorLocation: vendor.location,
                boxCount: batch.boxCount,
                slot,
                totalOrders: batch.boxCount
            };

            onlineDrivers.forEach(driver => {
                // FIX: Use the same room name pattern that the driver client joins
                // See client fix: socket.emit('join_driver_room', driverId) on connect
                const roomName = `delivery:${driver._id.toString()}`;
                io.to(roomName).emit('new_delivery_request', payload);
                logger.info(`[DRIVER-NOTIFY] Emitted to room "${roomName}" (driver: ${driver._id})`);
            });

            logger.info(`[DRIVER-NOTIFY] Broadcast complete: batch ${batch.batchId}, slot ${slot}, ${onlineDrivers.length} drivers notified`);
        }
    } catch (err) {
        logger.error(`[DRIVER-NOTIFY] Error in triggerDriverNotificationIfAllReady: ${err.message}`, err);
    }
};

export const notifyDriverOfRouteUpdate = (driverId) => {
    try {
        const io = getIO();
        if (io && driverId) {
            io.to(`delivery:${driverId.toString()}`).emit('order_status_update', {
                timestamp: Date.now(),
                message: 'Route updated'
            });
            logger.info(`Socket emitted order_status_update to driver ${driverId}`);
        }
    } catch (err) {
        logger.warn(`Failed to notify driver of route update: ${err.message}`);
    }
};

/**
 * Vendor updates order status → broadcasts via Socket.IO to customer
 */
export const updateDailyOrderStatus = async (orderId, status, vendorId) => {
    const validTransitions = {
        scheduled: ['preparing', 'skipped'],
        preparing: ['ready'],
        ready: ['out_for_delivery'],
        out_for_delivery: ['delivered'],
        delivered: [],
        skipped: [],
        failed: []
    };

    const order = await DMBDailyOrder.findOne({ _id: orderId, vendorId });
    if (!order) throw new Error('Order not found or not authorized');

    const allowed = validTransitions[order.status] || [];
    if (!allowed.includes(status)) {
        throw new Error(`Cannot transition from ${order.status} to ${status}`);
    }

    // ─── Enforce admin-configured timing window ───────────────────────────────
    if (status === 'preparing' || status === 'ready') {
        const timingCheck = await checkAdminTimingWindow(order.deliverySlot);
        if (!timingCheck.allowed) {
            throw new Error(timingCheck.message);
        }
    }

    if (status === 'preparing') order.preparingAt = new Date();
    if (status === 'ready') order.readyAt = new Date();
    if (status === 'out_for_delivery') order.pickedUpAt = new Date();
    if (status === 'delivered') order.deliveredAt = new Date();

    order.status = status;
    await order.save();

    const io = getIO();
    if (io) {
        const roomName = `sub_${order.subscriptionId}`;
        io.to(roomName).emit('order_status_updated', {
            orderId: order.orderId,
            _id: order._id,
            status: order.status,
            deliveryDate: order.deliveryDate,
            deliverySlot: order.deliverySlot,
            updatedAt: new Date().toISOString()
        });
        logger.info(`Socket emitted order_status_updated to room ${roomName}: ${status}`);

        // ─── NEW: Broadcast vendor preparation status to all drivers in zone ──
        if (status === 'preparing' || status === 'ready') {
            try {
                const vendor = await FoodRestaurant.findById(order.vendorId).select('zoneId city').lean();
                const zoneId = vendor?.zoneId ? String(vendor.zoneId) : null;
                const city = vendor?.city || '';
                const zoneRoom = zoneId ? `delivery_zone:${zoneId}` : (city ? `delivery_zone:${city.toLowerCase()}` : null);
                if (zoneRoom) {
                    io.to(zoneRoom).emit('vendor_order_status_changed', {
                        vendorId: String(order.vendorId),
                        slot: order.deliverySlot,
                        vendorStatus: status,
                        deliveryDate: order.deliveryDate
                    });
                    logger.info(`Socket emitted vendor_order_status_changed to ${zoneRoom}: ${status}`);
                }
            } catch (zoneErr) {
                logger.warn(`Failed to emit vendor_order_status_changed: ${zoneErr.message}`);
            }
        }
    }

    if (status === 'ready') {
        await triggerDriverNotificationIfAllReady(order.vendorId, order.deliveryDate, order.deliverySlot);
    }

    if (order.dispatch?.deliveryPartnerId) {
        notifyDriverOfRouteUpdate(order.dispatch.deliveryPartnerId);
    }

    logger.info(`DMB order ${order.orderId} status → ${status} by vendor ${vendorId}`);
    return order;
};


/**
 * Batch: Vendor marks all orders for a slot as "ready"
 */
export const markAllOrdersReady = async (vendorId, { date, slot }) => {
    const targetDate = toDateOnly(date ? new Date(date) : new Date());
    const nextDay = new Date(targetDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);

    const filter = {
        vendorId,
        deliveryDate: { $gte: targetDate, $lt: nextDay },
        status: { $in: ['scheduled', 'preparing'] }
    };
    if (slot) filter.deliverySlot = slot;

    const orders = await DMBDailyOrder.find(filter);
    if (orders.length === 0) {
        return { count: 0, date: dateStr(targetDate), slot, message: 'No pending orders found' };
    }

    // ─── Enforce admin-configured timing window ───────────────────────────
    if (slot) {
        const timingCheck = await checkAdminTimingWindow(slot);
        if (!timingCheck.allowed) {
            throw new Error(timingCheck.message);
        }
    }

    const io = getIO();
    let count = 0;

    for (const order of orders) {
        order.status = 'ready';
        order.readyAt = new Date();
        await order.save();
        count++;

        if (io) {
            io.to(`sub_${order.subscriptionId}`).emit('order_status_updated', {
                orderId: order.orderId,
                _id: order._id,
                status: 'ready',
                deliveryDate: order.deliveryDate,
                deliverySlot: order.deliverySlot,
                updatedAt: new Date().toISOString()
            });
        }

        if (order.dispatch?.deliveryPartnerId) {
            notifyDriverOfRouteUpdate(order.dispatch.deliveryPartnerId);
        }
    }

    await triggerDriverNotificationIfAllReady(vendorId, targetDate, slot || 'lunch');

    // ─── NEW: Broadcast "ready" status to all drivers in this vendor's zone ──
    if (io && count > 0) {
        try {
            const vendor = await FoodRestaurant.findById(vendorId).select('zoneId city').lean();
            const zoneId = vendor?.zoneId ? String(vendor.zoneId) : null;
            const city = vendor?.city || '';
            const zoneRoom = zoneId ? `delivery_zone:${zoneId}` : (city ? `delivery_zone:${city.toLowerCase()}` : null);
            if (zoneRoom) {
                io.to(zoneRoom).emit('vendor_order_status_changed', {
                    vendorId: String(vendorId),
                    slot: slot || 'unknown',
                    vendorStatus: 'ready',
                    deliveryDate: targetDate
                });
                logger.info(`markAllOrdersReady: emitted vendor_order_status_changed to ${zoneRoom}`);
            }
        } catch (zoneErr) {
            logger.warn(`markAllOrdersReady zone emit failed: ${zoneErr.message}`);
        }
    }

    logger.info(`Vendor ${vendorId} marked ${count} orders as ready for ${dateStr(targetDate)} / ${slot}`);
    return { count, date: dateStr(targetDate), slot };
};


// ─── Internal Formatter ────────────────────────────────────────────────────
const formatOrderCard = (order) => ({
    _id: order._id,
    orderId: order.orderId,
    vendorId: order.vendorId?._id || order.vendorId || null,
    status: order.status,
    deliveryDate: order.deliveryDate,
    deliverySlot: order.deliverySlot,
    vendor: {
        name: order.vendorId?.restaurantName || 'Vendor',
        image: order.vendorId?.profileImage || null,
        city: order.vendorId?.city || '',
        location: order.vendorId?.location || null
    },
    meals: (order.meals || []).map(m => ({
        mealPlanId: m.mealPlanId?._id || m.mealPlanId || null,
        name: m.name || m.mealPlanId?.name || 'Meal',
        photo: m.customPhoto || m.mealPlanId?.photos?.[0] || null,
        nutrition: m.customNutrition || m.mealPlanId?.nutrition || null,
        description: m.customDescription || m.mealPlanId?.description || '',
        quantity: m.quantity
    })),
    pricing: order.pricing,
    subscriptionId: order.subscriptionId,
    deliveryPin: order.deliveryPin || '',
    deliveryAddress: order.deliveryAddress,
    isRated: order.isRated || false,
    deliveryRating: order.deliveryRating || null,
    ratingFeedback: order.ratingFeedback || '',
    driverTip: order.driverTip || 0,
    dispatch: order.dispatch ? {
        deliveryPartner: order.dispatch.deliveryPartnerId ? {
            _id: order.dispatch.deliveryPartnerId._id,
            name: order.dispatch.deliveryPartnerId.name,
            profilePhoto: order.dispatch.deliveryPartnerId.profilePhoto,
            vehicleType: order.dispatch.deliveryPartnerId.vehicleType,
            phone: order.dispatch.deliveryPartnerId.phone
        } : null
    } : null
});

export async function notifyVendorsOfDriverUpdate(driver) {
    if (!driver || !driver.zoneIds || driver.zoneIds.length === 0) return;

    try {
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
        const { CollectionBatch } = await import('../delivery/collectionBatch.model.js');
        const { getIO } = await import('../../../config/socket.js');
        const io = getIO();
        if (!io) return;

        // Find all vendors in the driver's zones
        const vendors = await FoodRestaurant.find({
            $or: [
                { zoneId: { $in: driver.zoneIds } },
                { serviceZone: { $in: driver.zoneIds } }
            ]
        }).select('_id');

        for (const vendor of vendors) {
            const vendorId = vendor._id.toString();
            
            // Check for any active/pending batch for this vendor today
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            const batch = await CollectionBatch.findOne({
                vendorId: vendor._id,
                deliveryDate: { $gte: today, $lt: tomorrow },
                status: { $in: ['pending', 'driver_assigned', 'driver_en_route'] }
            });

            // Emit batch_accepted event so vendor dashboard reflects the driver change in real-time
            io.to(`vendor_${vendorId}`).emit('batch_accepted', {
                batchId: batch ? batch.batchId : null,
                driver: {
                    _id: driver._id,
                    name: driver.name,
                    phone: driver.phone,
                    vehicleNumber: driver.vehicleNumber,
                    profilePhoto: driver.profilePhoto
                },
                otp: batch ? batch.collectionPinHash : null,
                boxCount: batch ? batch.boxCount : 0,
                slot: batch ? batch.deliverySlot : 'lunch'
            });
            logger.info(`[REALTIME-DRIVER-ASSIGN] Notified vendor_${vendorId} of driver ${driver.name} zone assignment`);
        }
    } catch (err) {
        logger.error(`[REALTIME-DRIVER-ASSIGN] Error notifying vendors of driver update: ${err.message}`);
    }
}