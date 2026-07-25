import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { FoodItem } from '../../food/admin/models/food.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { createRazorpayOrder, verifyPaymentSignature, isRazorpayConfigured, getRazorpayKeyId } from '../../food/orders/helpers/razorpay.helper.js';

const router = express.Router();

// ─── USER ROUTES ────────────────────────────────────────────────────────────

// 1. Create Order (and Razorpay intent)
router.post('/create-order', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { vendorId, items, deliveryDates, deliverySlots, deliveryAddress: customDeliveryAddress, totalOverride } = req.body;
        const userId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;

        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized: User ID missing from token' });
        }

        if (!vendorId || !items || !items.length || !deliveryDates || !deliveryDates.length || !deliverySlots || !deliverySlots.length) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }

        const user = await FoodUser.findById(userId);
        const finalDeliveryAddress = customDeliveryAddress || (user ? user.deliveryAddress : null);

        if (!finalDeliveryAddress) {
            return res.status(400).json({ success: false, message: 'User delivery address not found' });
        }

        // Normalize address to prevent Mongoose validation errors
        let normalizedAddress = finalDeliveryAddress;
        if (typeof finalDeliveryAddress === 'string') {
            normalizedAddress = {
                street: finalDeliveryAddress,
                city: 'Unknown',
                state: 'Unknown',
                pincode: '000000',
                label: 'Home',
                location: { type: 'Point', coordinates: [0, 0] }
            };
        } else if (typeof finalDeliveryAddress === 'object') {
            normalizedAddress = {
                street: finalDeliveryAddress.street || 'Unknown',
                city: finalDeliveryAddress.city || 'Unknown',
                state: finalDeliveryAddress.state || 'Unknown',
                pincode: finalDeliveryAddress.pincode || '000000',
                label: finalDeliveryAddress.label || 'Home',
                location: finalDeliveryAddress.location || { type: 'Point', coordinates: [0, 0] }
            };
        }

        // Calculate daily items total
        let dailyItemsTotal = 0;
        const processedItems = [];
        for (const item of items) {
            const pItem = await FoodItem.findById(item.pantryItemId);
            if (!pItem || pItem.restaurantId.toString() !== vendorId) {
                return res.status(400).json({ success: false, message: `Invalid pantry item: ${item.title}` });
            }
            if (!pItem.isAvailable) {
                return res.status(400).json({ success: false, message: `Item out of stock: ${item.title}` });
            }
            const itemPrice = pItem.price || (pItem.variants && pItem.variants.length > 0 ? pItem.variants[0].price : 0);
            dailyItemsTotal += itemPrice * item.quantity;
            processedItems.push({
                pantryItemId: pItem._id,
                title: pItem.name,
                price: itemPrice,
                quantity: item.quantity
            });
        }

        // Fetch dynamic delivery fee configured by Admin
        let feePerOrder = 5; // fallback
        let platformFee = 0;
        try {
            const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
            const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
            if (feeConfig && Number(feeConfig.feePerOrder) > 0) {
                feePerOrder = Number(feeConfig.feePerOrder);
            }
            if (feeConfig && Number(feeConfig.platformFee) > 0) {
                platformFee = Number(feeConfig.platformFee);
            }
        } catch (err) { }

        // Fetch vendor Food VAT % from commission config
        let foodVatPercent = 0;
        try {
            const { FoodRestaurantCommission } = await import('../../food/admin/models/restaurantCommission.model.js');
            const commConfig = await FoodRestaurantCommission.findOne({ restaurantId: vendorId }).lean();
            if (commConfig && Number(commConfig.foodVatPercent) > 0) {
                foodVatPercent = Number(commConfig.foodVatPercent);
            }
        } catch (err) { }

        const dailyDeliveryFee = feePerOrder;

        // Total cost — matches frontend formula exactly:
        // Grand Total = Items Total × (Days × Slots) + Food VAT + Platform Fee
        const numDates = deliveryDates.length;
        const numSlots = deliverySlots.length;
        const itemsTotal = dailyItemsTotal;
        const foodVatAmount = Math.round((itemsTotal * (foodVatPercent / 100)) * 100) / 100;
        const deliveryFee = dailyDeliveryFee * numDates;
        const grandTotal = (itemsTotal * (numDates * numSlots)) + foodVatAmount + platformFee;

        // If the frontend passed a pre-calculated totalOverride, use it as the
        // authoritative amount. This ensures the Razorpay order amount always
        // matches the Grand Total shown in the checkout UI (which accounts for
        // the union of dates/slots across ALL items, not just this group).
        const effectiveGrandTotal =
            totalOverride != null && Number(totalOverride) > 0
                ? Number(totalOverride)
                : grandTotal;

        const razorpayAmountPaise = Math.round(effectiveGrandTotal * 100);

        const orderId = `PO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        // Get the start of the current week (Monday)
        const d = new Date();
        const currentDayIdx = d.getDay();
        const diff = d.getDate() - currentDayIdx + (currentDayIdx === 0 ? -6 : 1);
        const weekStartDate = new Date(d.setDate(diff));
        weekStartDate.setHours(0, 0, 0, 0);

        const dailyDeliveries = [];
        for (const dateStr of deliveryDates) {
            const dayDate = new Date(dateStr);
            const dayOfWeek = dayDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            for (const slot of deliverySlots) {
                dailyDeliveries.push({
                    date: dayDate,
                    dayOfWeek: dayOfWeek,
                    slot: slot,
                    status: 'scheduled'
                });
            }
        }

        let razorpayOrder = null;
        if (isRazorpayConfigured()) {
            razorpayOrder = await createRazorpayOrder(razorpayAmountPaise, 'INR', orderId);
        }

        const newOrder = await PantryOrder.create({
            orderId,
            userId,
            vendorId,
            items: processedItems,
            deliveryDates,
            deliverySlots,
            deliveryAddress: normalizedAddress,
            pricing: {
                itemsTotal,
                deliveryFee,
                foodVatPercent,
                foodVatAmount,
                platformFee,
                total: effectiveGrandTotal
            },
            status: 'pending_payment',
            dailyDeliveries,
            paymentOrderId: razorpayOrder ? razorpayOrder.id : `mock_order_${orderId}`,
            weekStartDate
        });

        res.status(200).json({
            success: true,
            order: newOrder,
            razorpayOrderId: newOrder.paymentOrderId,
            razorpayKeyId: getRazorpayKeyId() || 'rzp_test_dummy',
            razorpayAmount: razorpayAmountPaise, // paise — for frontend amount-mismatch guard
        });

    } catch (error) {
        console.error('Error creating pantry order:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// 2. Verify Payment
router.post('/verify-payment', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { orderId, razorpayPaymentId, razorpaySignature } = req.body;
        const userId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;

        const order = await PantryOrder.findOne({ orderId, userId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order.status !== 'pending_payment') return res.status(400).json({ success: false, message: 'Order already processed' });

        if (isRazorpayConfigured()) {
            const isValid = verifyPaymentSignature(order.paymentOrderId, razorpayPaymentId, razorpaySignature);
            if (!isValid) return res.status(400).json({ success: false, message: 'Invalid payment signature' });
        }

        order.status = 'paid';
        order.paymentId = razorpayPaymentId || `mock_payment_${orderId}`;
        order.paymentSignature = razorpaySignature || 'mock_signature';
        order.paymentStatus = 'completed';
        await order.save();

        res.status(200).json({ success: true, message: 'Payment verified successfully', order });

    } catch (error) {
        console.error('Error verifying pantry payment:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// 3. Get User Orders
router.get('/my-orders', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;
        const { type } = req.query; // 'upcoming' or 'past'

        let query = { userId };

        if (type === 'upcoming') {
            query.status = { $nin: ['delivered', 'failed', 'cancelled', 'skipped'] };
        } else if (type === 'past') {
            query.status = { $in: ['delivered', 'failed', 'cancelled', 'skipped'] };
        }

        const orders = await PantryOrder.find(query)
            .populate('vendorId', 'restaurantName logo')
            .sort({ createdAt: -1 });
        res.status(200).json({ success: true, orders });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});


// ─── VENDOR ROUTES ──────────────────────────────────────────────────────────

// 4. Get Vendor Orders Grouped By Day
router.get('/vendor', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const { date } = req.query; // date in YYYY-MM-DD
        const vendorId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;

        let query = { vendorId, status: 'paid' };

        if (date) {
            const startOfDay = new Date(date);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(date);
            endOfDay.setHours(23, 59, 59, 999);

            query['dailyDeliveries.date'] = { $gte: startOfDay, $lte: endOfDay };
        }

        const orders = await PantryOrder.find(query)
            .populate('userId', 'firstName lastName name phone')
            .sort({ createdAt: -1 });

        const expandedOrders = [];
        orders.forEach(order => {
            order.dailyDeliveries.forEach(delivery => {
                // If date was specified, filter out the deliveries for other days
                if (date) {
                    const startOfDay = new Date(date);
                    startOfDay.setHours(0, 0, 0, 0);
                    const endOfDay = new Date(date);
                    endOfDay.setHours(23, 59, 59, 999);
                    if (new Date(delivery.date).getTime() < startOfDay.getTime() || new Date(delivery.date).getTime() > endOfDay.getTime()) {
                        return;
                    }
                }

                expandedOrders.push({
                    id: order._id,
                    orderId: order.orderId,
                    deliveryId: delivery._id, // important for updates
                    day: delivery.dayOfWeek,
                    date: delivery.date,
                    status: delivery.status, // mapped from daily delivery
                    itemsName: order.items.map(i => `${i.quantity}x ${i.title}`).join(', '),
                    deliverySlot: delivery.slot,
                    zone: order.deliveryAddress.city + ' - ' + (order.deliveryAddress.label || order.deliveryAddress.street),
                    customer: order.userId,
                    createdAt: order.createdAt
                });
            });
        });

        res.status(200).json({ success: true, orders: expandedOrders });
    } catch (error) {
        console.error('Error fetching vendor pantry orders:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// 5. Update Daily Delivery Status (Vendor marking it ready)
router.patch('/:id/daily-status', authMiddleware, requireRoles('RESTAURANT'), async (req, res) => {
    try {
        const { deliveryId, status } = req.body;
        const vendorId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;

        // Find the order that has this dailyDelivery
        const order = await PantryOrder.findOne({ _id: req.params.id, vendorId });
        if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

        const deliveryIndex = order.dailyDeliveries.findIndex(d => d._id.toString() === deliveryId);
        if (deliveryIndex === -1) return res.status(404).json({ success: false, message: 'Delivery day not found' });

        order.dailyDeliveries[deliveryIndex].status = status;
        await order.save();

        res.status(200).json({ success: true, message: 'Status updated', order });
    } catch (error) {
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

export default router;
