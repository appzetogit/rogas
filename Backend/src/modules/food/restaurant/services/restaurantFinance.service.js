import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodRestaurant } from '../models/restaurant.model.js';
import { FoodRestaurantWithdrawal } from '../models/foodRestaurantWithdrawal.model.js';

function toTwoDigitYearString(dateObj) {
    const y = String(dateObj.getFullYear());
    return y.slice(-2);
}

function monthShort(monthIndex) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[monthIndex] || 'Jan';
}

function getFixedCurrentCycleWindow(now = new Date()) {
    const startDay = 15;
    
    let year = now.getFullYear();
    let month = now.getMonth();

    // If before start day, settlement belongs to previous month cycle.
    if (now.getDate() < startDay) {
        month = month - 1;
        if (month < 0) {
            month = 11;
            year -= 1;
        }
    }

    const start = new Date(year, month, startDay, 0, 0, 0, 0);
    // End should be either fixed 21 or now, let's make it more inclusive for "Current Cycle"
    // Users want to see their active earnings, so we extend it to 'now'
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return {
        start,
        end,
        startMeta: { day: String(startDay), month: monthShort(month), year: toTwoDigitYearString(new Date(year, month, startDay)) },
        endMeta: { day: String(now.getDate()), month: monthShort(now.getMonth()), year: toTwoDigitYearString(now) }
    };
}

function parseISODateParam(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d;
}

function parseISODateParamEnd(v) {
    if (!v) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    d.setHours(23, 59, 59, 999);
    return d;
}

export async function getRestaurantFinance(restaurantId, query = {}) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    // Fetch restaurant profile for header display.
    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName addressLine1 addressLine2 area city state pincode location')
        .lean();

    const address =
        restaurant?.location?.formattedAddress ||
        (restaurant?.addressLine1
            ? [restaurant.addressLine1, restaurant.addressLine2, restaurant.area].filter(Boolean).join(', ')
            : restaurant?.addressLine1 || '');

    const nowWindow = getFixedCurrentCycleWindow(new Date());

    // Current cycle: sum ledger payouts in the fixed window.
    const currentTransactions = await FoodTransaction.find({
        restaurantId: rid,
        status: { $in: ['captured', 'authorized'] },
        createdAt: { $gte: nowWindow.start, $lte: nowWindow.end }
    })
        .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
        .sort({ createdAt: -1 })
        .lean();

    const currentCycleOrders = currentTransactions.map((tx) => {
        const order = tx.orderId || {};
        const items = Array.isArray(order.items) ? order.items : [];
        const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
        const orderTotalExclTax = Math.max(
            0,
            Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
        );
        return {
            orderId: order?.orderId || tx.orderReadableId,
            createdAt: tx.createdAt,
            items,
            foodNames,
            orderTotal: orderTotalExclTax,
            totalAmount: tx.amounts?.totalCustomerPaid || 0,
            payout: tx.amounts?.restaurantShare || 0,
            commission: tx.amounts?.restaurantCommission || 0,
            paymentMethod: tx.paymentMethod || order?.payment?.method,
            orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status,
            status: tx.status
        };
    });

    const currentCycleEstimatedPayout = currentCycleOrders.reduce(
        (sum, o) => sum + (Number(o.payout) || 0),
        0
    );

    // Calculate global estimated payout (all unsettled transactions)
    const allUnsettledTransactions = await FoodTransaction.find({
        restaurantId: rid,
        status: { $in: ['captured', 'authorized'] },
        'settlement.isRestaurantSettled': { $ne: true }
    }).select('amounts.restaurantShare').lean();

    const globalEstimatedPayout = allUnsettledTransactions.reduce(
        (sum, tx) => sum + (Number(tx.amounts?.restaurantShare) || 0),
        0
    );

    // Deduct all effective withdrawals from available balance.
    // Both pending and approved reduce withdrawable amount; rejected should not.
    const effectiveWithdrawalsAgg = await FoodRestaurantWithdrawal.aggregate([
        {
            $match: {
                restaurantId: rid,
                $expr: {
                    $in: [
                        { $toLower: { $trim: { input: '$status' } } },
                        ['pending', 'approved']
                    ]
                }
            }
        },
        { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);
    const totalEffectiveWithdrawals = Number(effectiveWithdrawalsAgg?.[0]?.total || 0);
    const availableBalance = Math.max(0, globalEstimatedPayout - totalEffectiveWithdrawals);

    const currentCycle = {
        start: { ...nowWindow.startMeta },
        end: { ...nowWindow.endMeta },
        totalEarnings: currentCycleEstimatedPayout, // We still show current cycle earnings label
        totalWithdrawn: totalEffectiveWithdrawals,
        estimatedPayout: availableBalance, // This is what UI shows as "Estimated Payout" (Available Balance)
        totalOrders: currentCycleOrders.length,
        payoutDate: null,
        orders: currentCycleOrders
    };

    // Invoice Summary (derived from current cycle or broader if needed)
    const invoiceSummary = {
        count: currentCycleOrders.length,
        subtotal: currentCycleOrders.reduce((sum, o) => sum + (Number(o.orderTotal) || 0), 0),
        taxes: currentCycleOrders.reduce((sum, o) => sum + Math.max(0, (Number(o.totalAmount) || 0) - (Number(o.orderTotal) || 0)), 0),
        gross: currentCycleOrders.reduce((sum, o) => sum + (Number(o.totalAmount) || 0), 0)
    };

    // Past cycles: build from provided startDate/endDate query.
    const startDate = parseISODateParam(query.startDate);
    const endDate = parseISODateParamEnd(query.endDate);

    let pastCyclesResult = { orders: [], totalOrders: 0 };
    if (startDate && endDate) {
        const pastTransactions = await FoodTransaction.find({
            restaurantId: rid,
            status: { $in: ['captured', 'authorized'] },
            createdAt: { $gte: startDate, $lte: endDate }
        })
            .populate('orderId', 'orderId createdAt items pricing deliveryState orderStatus')
            .sort({ createdAt: -1 })
            .lean();

        const pastCycleOrders = pastTransactions.map((tx) => {
            const order = tx.orderId || {};
            const items = Array.isArray(order.items) ? order.items : [];
            const foodNames = items.map((it) => it?.name).filter(Boolean).join(', ');
            const orderTotalExclTax = Math.max(
                0,
                Number(order?.pricing?.total ?? 0) - Number(order?.pricing?.tax ?? 0) || 0
            );

            return {
                orderId: order?.orderId || tx.orderReadableId,
                createdAt: tx.createdAt,
                items,
                foodNames,
                orderTotal: orderTotalExclTax,
                totalAmount: tx.amounts?.totalCustomerPaid || 0,
                payout: tx.amounts?.restaurantShare || 0,
                commission: tx.amounts?.restaurantCommission || 0,
                paymentMethod: tx.paymentMethod || order?.payment?.method,
                orderStatus: order?.orderStatus || order?.deliveryState?.currentPhase || order?.deliveryState?.status,
                status: tx.status
            };
        });

        pastCyclesResult = {
            orders: pastCycleOrders,
            totalOrders: pastCycleOrders.length
        };
    }

    return {
        restaurant: {
            name: restaurant?.restaurantName || '',
            restaurantId: restaurant?._id ? `REST${restaurant._id.toString().slice(-6).padStart(6, '0')}` : 'N/A',
            address
        },
        currentCycle,
        invoiceSummary,
        pastCycles: pastCyclesResult
    };
}


/**
 * Returns a live earnings summary for a vendor.
 * Used by the new /earnings endpoint in the Vendor Panel.
 * Does NOT affect or replace getRestaurantFinance.
 */
export async function getVendorEarningsSummary(restaurantId) {
    if (!restaurantId || !mongoose.Types.ObjectId.isValid(restaurantId)) return null;
    const rid = new mongoose.Types.ObjectId(restaurantId);

    // Fetch restaurant name for display
    const restaurant = await FoodRestaurant.findById(rid)
        .select('restaurantName')
        .lean();

    // Fetch active commission config for this restaurant (to display rates)
    let commissionConfig = null;
    try {
        const { FoodRestaurantCommission } = await import('../../admin/models/restaurantCommission.model.js');
        commissionConfig = await FoodRestaurantCommission.findOne({
            restaurantId: rid,
            status: { $ne: false }
        }).lean();
    } catch (_) {}

    const commissionVatRate = Number(commissionConfig?.defaultCommission?.value ?? 0);
    const commissionVatType = commissionConfig?.defaultCommission?.type || 'percentage';
    const platformCommissionVatRate = Number(commissionConfig?.platformCommissionVatPercent ?? 0);
    const foodVatRate = Number(commissionConfig?.foodVatPercent ?? 0);

    // All captured/authorized transactions for this restaurant (lifetime)
    const allTransactions = await FoodTransaction.find({
        restaurantId: rid,
        status: { $in: ['captured', 'authorized'] }
    })
        .populate('orderId', 'orderId order_id createdAt items pricing orderStatus deliveryState')
        .sort({ createdAt: -1 })
        .lean();

    // Fetch DMB daily orders
    let dmbOrders = [];
    try {
        const { DMBDailyOrder } = await import('../../../dailymealbox/subscription/dmb.dailyOrder.model.js');
        dmbOrders = await DMBDailyOrder.find({
            vendorId: rid,
            status: 'delivered'
        })
            .populate('meals.mealPlanId', 'name pricePerDay')
            .sort({ deliveredAt: -1 })
            .lean();
    } catch (_) {}

    // Aggregate totals
    let totalOrders = 0;
    let grossEarnings = 0;
    let commissionVatDeduction = 0;
    let platformCommissionVatDeduction = 0;
    let foodVatDeduction = 0;
    let netEarnings = 0;

    const mergedTxList = [];

    // Map legacy transactions
    for (const tx of allTransactions) {
        const order = tx.orderId || {};
        if (order.orderStatus !== 'delivered') {
            continue;
        }
        totalOrders++;
        const gross = Number(tx.amounts?.totalCustomerPaid || 0);
        const netShare = Number(tx.amounts?.restaurantShare || 0);
        const commVat = Number(tx.amounts?.commissionVatAmount || tx.amounts?.restaurantCommission || 0);
        const platVat = Number(tx.amounts?.platformCommissionVatAmount || 0);
        const foodVat = Number(tx.amounts?.foodVatAmount || 0);

        grossEarnings += gross;
        commissionVatDeduction += commVat;
        platformCommissionVatDeduction += platVat;
        foodVatDeduction += foodVat;
        netEarnings += netShare;

        const items = Array.isArray(order.items) ? order.items : [];
        mergedTxList.push({
            transactionId: tx._id,
            orderId: order.order_id || order.orderId || tx._id,
            createdAt: tx.createdAt,
            foodNames: items.map(i => i?.name).filter(Boolean).join(', '),
            grossAmount: gross,
            commissionVatAmount: commVat,
            platformCommissionVatAmount: platVat,
            foodVatAmount: foodVat,
            netAmount: netShare,
            paymentMethod: tx.paymentMethod,
            orderStatus: order.orderStatus || ''
        });
    }

    // Map DMB transactions
    for (const order of dmbOrders) {
        totalOrders++;
        const foodCost = order.pricing?.foodCost || order.pricing?.totalPrice || 0;
        const foodVat = order.pricing?.foodVat || 0;
        const foodVatAmount = order.pricing?.foodVatAmount || 0;
        const deliveryFee = order.pricing?.deliveryFee || 0;
        const deliveryVatAmount = order.pricing?.deliveryVatAmount || 0;
        const platformFeeAmount = order.pricing?.platformFee || 0;

        const gross = order.pricing?.totalPrice || (foodCost + foodVatAmount + deliveryFee + deliveryVatAmount + platformFeeAmount);

        let commissionAmount = 0;
        if (commissionVatRate > 0) {
            commissionAmount = Math.round((foodCost * (commissionVatRate / 100)) * 100) / 100;
        }
        
        const restaurantShare = Math.max(0, Math.round((foodCost - commissionAmount) * 100) / 100);

        grossEarnings += gross;
        commissionVatDeduction += commissionAmount;
        platformCommissionVatDeduction += platformFeeAmount;
        foodVatDeduction += foodVatAmount;
        netEarnings += restaurantShare;

        const foodNames = (order.meals || []).map(m => m.name || m.mealPlanId?.name).filter(Boolean).join(', ') || 'Subscription Meal';
        mergedTxList.push({
            transactionId: order._id,
            orderId: order.orderId || order._id.toString(),
            createdAt: order.deliveredAt || order.updatedAt,
            foodNames,
            grossAmount: Math.round(gross * 100) / 100,
            commissionVatAmount: commissionAmount,
            platformCommissionVatAmount: platformFeeAmount,
            foodVatAmount: foodVatAmount,
            netAmount: restaurantShare,
            paymentMethod: 'ONLINE',
            orderStatus: 'delivered'
        });
    }

    // Sort by date desc and slice top 20
    const recentTransactions = mergedTxList
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 20);

    // Available balance (net - effective withdrawals)
    let totalWithdrawals = 0;
    try {
        const { FoodRestaurantWithdrawal } = await import('../models/foodRestaurantWithdrawal.model.js');
        const withdrawalAgg = await FoodRestaurantWithdrawal.aggregate([
            {
                $match: {
                    restaurantId: rid,
                    $expr: {
                        $in: [
                            { $toLower: { $trim: { input: '$status' } } },
                            ['pending', 'approved']
                        ]
                    }
                }
            },
            { $group: { _id: null, total: { $sum: '$amount' } } }
        ]);
        totalWithdrawals = Number(withdrawalAgg?.[0]?.total || 0);
    } catch (_) {}

    const availableBalance = Math.max(0, netEarnings - totalWithdrawals);

    return {
        restaurant: {
            name: restaurant?.restaurantName || '',
            restaurantId: rid.toString()
        },
        commissionRates: {
            commissionVatRate,
            commissionVatType,
            platformCommissionVatRate,
            foodVatRate
        },
        summary: {
            totalOrders,
            grossEarnings: Math.round(grossEarnings * 100) / 100,
            commissionVatDeduction: Math.round(commissionVatDeduction * 100) / 100,
            platformCommissionVatDeduction: Math.round(platformCommissionVatDeduction * 100) / 100,
            foodVatDeduction: Math.round(foodVatDeduction * 100) / 100,
            totalDeductions: Math.round((commissionVatDeduction + platformCommissionVatDeduction + foodVatDeduction) * 100) / 100,
            netEarnings: Math.round(netEarnings * 100) / 100,
            availableBalance: Math.round(availableBalance * 100) / 100
        },
        recentTransactions
    };
}
