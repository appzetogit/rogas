import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { PantryOrder } from '../../food/restaurant/models/pantryOrder.model.js';
import { FoodItem } from '../../food/admin/models/food.model.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { startPayment, findOwnedTransaction, confirmRazorpayPayment, PaymentsError } from '../../payments/payments.service.js';
import { resolvePaymentContext, resolveProviders } from '../../payments/payments.settings.js';

const router = express.Router();

// ─── USER ROUTES ────────────────────────────────────────────────────────────

const round2 = (n) => Math.round(Number(n) * 100) / 100;

const normalizeAddress = (raw) => {
    if (typeof raw === 'string') {
        return { street: raw, city: 'Unknown', state: 'Unknown', pincode: '000000', label: 'Home', location: { type: 'Point', coordinates: [0, 0] } };
    }
    return {
        street: raw.street || 'Unknown',
        city: raw.city || 'Unknown',
        state: raw.state || 'Unknown',
        pincode: raw.pincode || '000000',
        label: raw.label || 'Home',
        location: raw.location || { type: 'Point', coordinates: [0, 0] }
    };
};

/** Food VAT % (per vendor) and platform fee (platform-wide), both set by the admin. */
const loadCartPricingConfig = async (vendorId) => {
    let feePerOrder = 5; // fallback
    let platformFee = 0;
    try {
        const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
        const feeConfig = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
        if (feeConfig && Number(feeConfig.feePerOrder) > 0) feePerOrder = Number(feeConfig.feePerOrder);
        if (feeConfig && Number(feeConfig.platformFee) > 0) platformFee = Number(feeConfig.platformFee);
    } catch (err) { }
    let foodVatPercent = 0;
    try {
        const { FoodRestaurantCommission } = await import('../../food/admin/models/restaurantCommission.model.js');
        const commConfig = await FoodRestaurantCommission.findOne({ restaurantId: vendorId }).lean();
        if (commConfig && Number(commConfig.foodVatPercent) > 0) foodVatPercent = Number(commConfig.foodVatPercent);
    } catch (err) { }
    return { feePerOrder, platformFee, foodVatPercent };
};

const startOfWeek = () => {
    const d = new Date();
    const diff = d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
};

/**
 * Prices the whole cart from the database (never from the browser) and creates one pending order per date/slot group.
 * Total = items total x (distinct delivery days x distinct slots) + food VAT + platform fee, the same formula the
 * checkout screen shows. Returns the pending orders and the amount to collect.
 */
const createPendingPantryOrders = async ({ userId, vendorId, groups, deliveryAddress, minimumTotal = 0 }) => {
    const cfg = await loadCartPricingConfig(vendorId);
    const priced = [];
    const allDates = new Set();
    const allSlots = new Set();
    let itemsTotalAll = 0;

    for (const group of groups) {
        if (!group.items?.length || !group.deliveryDates?.length || !group.deliverySlots?.length) {
            throw new PaymentsError('Missing required fields', 400, 'BAD_REQUEST');
        }
        let groupItemsTotal = 0;
        const processedItems = [];
        for (const item of group.items) {
            const pItem = await FoodItem.findById(item.pantryItemId);
            if (!pItem || pItem.restaurantId.toString() !== String(vendorId)) {
                throw new PaymentsError(`Invalid pantry item: ${item.title || item.pantryItemId}`, 400, 'BAD_REQUEST');
            }
            if (!pItem.isAvailable) throw new PaymentsError(`Item out of stock: ${item.title || pItem.name}`, 400, 'BAD_REQUEST');
            const quantity = Math.max(1, Math.floor(Number(item.quantity) || 1));
            const itemPrice = pItem.price || (pItem.variants && pItem.variants.length > 0 ? pItem.variants[0].price : 0);
            groupItemsTotal += itemPrice * quantity;
            processedItems.push({ pantryItemId: pItem._id, title: pItem.name, price: itemPrice, quantity });
        }
        group.deliveryDates.forEach((d) => allDates.add(d));
        group.deliverySlots.forEach((s) => allSlots.add(s));
        itemsTotalAll += groupItemsTotal;
        priced.push({ group, processedItems, itemsTotal: groupItemsTotal });
    }

    const foodVatAmountAll = round2(itemsTotalAll * (cfg.foodVatPercent / 100));
    const serverTotal = round2(itemsTotalAll * (allDates.size * allSlots.size) + foodVatAmountAll + cfg.platformFee);
    // Older single-group clients pass the whole-cart total they computed; honour it only when it is HIGHER than ours.
    const grandTotal = Math.max(serverTotal, round2(minimumTotal));
    if (!(grandTotal > 0)) throw new PaymentsError('Invalid order total', 400, 'BAD_REQUEST');

    // Split the grand total across the orders in proportion to their items so the parts add up exactly.
    let allocated = 0;
    const orders = [];
    const weekStartDate = startOfWeek();
    for (let i = 0; i < priced.length; i++) {
        const { group, processedItems, itemsTotal } = priced[i];
        const share = i === priced.length - 1 ? round2(grandTotal - allocated) : round2(itemsTotalAll > 0 ? grandTotal * (itemsTotal / itemsTotalAll) : grandTotal / priced.length);
        allocated = round2(allocated + share);

        const dailyDeliveries = [];
        for (const dateStr of group.deliveryDates) {
            const dayDate = new Date(dateStr);
            const dayOfWeek = dayDate.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();
            for (const slot of group.deliverySlots) dailyDeliveries.push({ date: dayDate, dayOfWeek, slot, status: 'scheduled' });
        }
        orders.push({
            orderId: `PO-${Math.random().toString(36).substr(2, 6).toUpperCase()}`,
            userId,
            vendorId,
            items: processedItems,
            deliveryDates: group.deliveryDates,
            deliverySlots: group.deliverySlots,
            deliveryAddress,
            pricing: {
                itemsTotal,
                deliveryFee: cfg.feePerOrder * group.deliveryDates.length,
                foodVatPercent: cfg.foodVatPercent,
                foodVatAmount: round2(foodVatAmountAll * (itemsTotalAll > 0 ? itemsTotal / itemsTotalAll : 1)),
                platformFee: i === 0 ? cfg.platformFee : 0,
                total: share
            },
            status: 'pending_payment',
            dailyDeliveries,
            paymentOrderId: '',
            weekStartDate
        });
    }
    return { orders: await PantryOrder.insertMany(orders), grandTotal };
};

/** Creates the pending orders and starts one payment that settles all of them. */
const checkoutPantry = async (req, res, { groups, minimumTotal, expectedTotal }) => {
    const userId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized: User ID missing from token' });
    const { vendorId, deliveryAddress: customDeliveryAddress, provider, zoneId, returnPath, cancelPath, language } = req.body;
    if (!vendorId || !groups?.length) return res.status(400).json({ success: false, message: 'Missing required fields' });

    const user = await FoodUser.findById(userId);
    const finalDeliveryAddress = customDeliveryAddress || (user ? user.deliveryAddress : null);
    if (!finalDeliveryAddress) return res.status(400).json({ success: false, message: 'User delivery address not found' });

    // Where the customer is decides the provider and currency: the vendor's zone, else the customer's phone country.
    let vendorZone = zoneId;
    if (!vendorZone) {
        const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
        vendorZone = (await FoodRestaurant.findById(vendorId).select('zoneId').lean())?.zoneId;
    }
    const ctx = await resolvePaymentContext({ zoneId: vendorZone, dialCode: user?.countryCode });
    const available = await resolveProviders({ country: ctx.country, currency: ctx.currency });
    if (!available.length) {
        return res.status(503).json({ success: false, code: 'NO_PROVIDER', message: 'No payment method is available for your region right now. Please contact support.' });
    }

    let orders = [];
    try {
        const built = await createPendingPantryOrders({ userId, vendorId, groups, deliveryAddress: normalizeAddress(finalDeliveryAddress), minimumTotal });
        orders = built.orders;
        if (expectedTotal != null && Math.abs(round2(expectedTotal) - built.grandTotal) > 0.01) {
            throw new PaymentsError('Prices have changed. Please review your cart and try again.', 409, 'PRICE_CHANGED');
        }
        const { payment } = await startPayment({
            purpose: 'pantry',
            ownerType: 'user',
            ownerId: userId,
            amount: built.grandTotal,
            currency: ctx.currency,
            country: ctx.country,
            provider,
            description: `Pantry order (${orders.length} ${orders.length === 1 ? 'group' : 'groups'})`,
            customer: { name: user?.name, email: user?.email, phone: user?.phone },
            language,
            returnPath: returnPath || '/user/orders',
            cancelPath: cancelPath || '/user/cart',
            refs: { orderIds: orders.map((o) => o.orderId) }
        });
        await PantryOrder.updateMany({ _id: { $in: orders.map((o) => o._id) } }, { $set: { paymentOrderId: payment.provider === 'razorpay' ? payment.action.orderId : payment.transactionId } });
        const body = { success: true, payment, order: orders[0], orders };
        if (payment.provider === 'razorpay') {
            // Fields the existing checkout screen reads. razorpayAmount is in minor units (paise/grosze).
            Object.assign(body, { razorpayOrderId: payment.action.orderId, razorpayKeyId: payment.action.key, razorpayAmount: payment.action.amount });
        }
        return res.status(200).json(body);
    } catch (error) {
        if (orders.length) await PantryOrder.deleteMany({ _id: { $in: orders.map((o) => o._id) }, status: 'pending_payment' }).catch(() => {});
        if (error instanceof PaymentsError) return res.status(error.statusCode).json({ success: false, code: error.code, message: error.message });
        console.error('Error creating pantry order:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
};

// 1. Checkout: one payment for the whole cart, all date/slot groups created together
router.post('/checkout', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { groups, expectedTotal } = req.body;
        return await checkoutPantry(req, res, { groups, expectedTotal });
    } catch (error) {
        console.error('Error in pantry checkout:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// 1b. Create Order (single group, kept for older clients)
router.post('/create-order', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { items, deliveryDates, deliverySlots, totalOverride } = req.body;
        if (!items || !items.length || !deliveryDates || !deliveryDates.length || !deliverySlots || !deliverySlots.length) {
            return res.status(400).json({ success: false, message: 'Missing required fields' });
        }
        return await checkoutPantry(req, res, { groups: [{ items, deliveryDates, deliverySlots }], minimumTotal: totalOverride != null ? Number(totalOverride) : 0 });
    } catch (error) {
        console.error('Error creating pantry order:', error);
        return res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// 2. Verify Payment (Razorpay only; hosted-page providers settle through their webhook)
router.post('/verify-payment', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const { orderId, transactionId, razorpayOrderId } = req.body;
        const userId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;

        const order = orderId ? await PantryOrder.findOne({ orderId, userId }) : null;
        const tx = await findOwnedTransaction({
            publicId: transactionId,
            providerOrderId: razorpayOrderId || order?.paymentOrderId,
            purpose: 'pantry',
            ownerId: userId
        });
        if (!tx) return res.status(404).json({ success: false, message: 'Order not found' });
        if (order && !(tx.refs?.orderIds || []).includes(order.orderId)) return res.status(400).json({ success: false, message: 'Payment does not belong to this order' });

        const after = await confirmRazorpayPayment(tx, {
            razorpay_order_id: tx.providerOrderId,
            razorpay_payment_id: req.body.razorpayPaymentId,
            razorpay_signature: req.body.razorpaySignature
        });
        if (!['paid', 'partially_refunded', 'refunded'].includes(after.status)) {
            return res.status(400).json({ success: false, message: 'Payment is not completed yet' });
        }
        const orders = await PantryOrder.find({ orderId: { $in: tx.refs?.orderIds || [] }, userId });
        res.status(200).json({ success: true, message: 'Payment verified successfully', order: orders[0], orders });
    } catch (error) {
        if (error instanceof PaymentsError) return res.status(error.statusCode).json({ success: false, message: error.message });
        console.error('Error verifying pantry payment:', error);
        res.status(500).json({ success: false, message: 'Server error', error: error.message });
    }
});

// 3. Get User Orders
router.get('/my-orders', authMiddleware, requireRoles('USER', 'EMPLOYEE'), async (req, res) => {
    try {
        const userId = req.user?._id || req.user?.userId || req.user?.accountId || req.user?.id;
        const { type, date, page, limit } = req.query; // 'upcoming' or 'past' or 'date'

        let query = { userId };

        if (date) {
            query.deliveryDates = date;
        } else if (type === 'upcoming') {
            query.status = { $nin: ['delivered', 'failed', 'cancelled', 'skipped'] };
            // Restrict to strictly today's orders
            const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const yyyy = todayIST.getFullYear();
            const mm = String(todayIST.getMonth() + 1).padStart(2, '0');
            const dd = String(todayIST.getDate()).padStart(2, '0');
            query.deliveryDates = `${yyyy}-${mm}-${dd}`;
        } else if (type === 'past') {
            query.status = { $in: ['delivered', 'failed', 'cancelled', 'skipped'] };
        }

        let queryObj = PantryOrder.find(query)
            .populate('vendorId', 'restaurantName logo')
            .sort({ createdAt: -1 });
            
        let totalOrders = 0;
        let totalPages = 1;
        let currentPage = 1;

        if (!date && page && limit) {
            currentPage = parseInt(page, 10) || 1;
            const pageLimit = parseInt(limit, 10) || 9;
            const skip = (currentPage - 1) * pageLimit;
            
            totalOrders = await PantryOrder.countDocuments(query);
            totalPages = Math.ceil(totalOrders / pageLimit);

            queryObj = queryObj.skip(skip).limit(pageLimit);
        }

        const orders = await queryObj;

        if (!date && page && limit) {
            res.status(200).json({ success: true, orders, pagination: { currentPage, totalPages, totalOrders } });
        } else {
            res.status(200).json({ success: true, orders });
        }
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
