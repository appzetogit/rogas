/**
 * DailyMealBox Notification Catalogue
 * All FCM push notification templates — 40+ types across Customer, Vendor, Driver
 * PRD Reference: All 4 PRDs — notification sections
 * 
 * Usage: notificationCatalogue.customer.orderConfirmed(data)
 */

export const notificationCatalogue = {

    // ─── CUSTOMER NOTIFICATIONS ────────────────────────────────────────────────
    customer: {
        orderConfirmed: (data) => ({
            title: 'Subscription confirmed! 🎉',
            body: `Your meal plan starts ${data.startDate}. Get ready for delicious food!`,
            data: { screen: 'subscription_detail', subscriptionId: data.subscriptionId, event: 'order_confirmed' }
        }),

        outForDelivery: (data) => ({
            title: '🛵 Driver is on the way!',
            body: `${data.driverName} is heading to you with ${data.mealName}. ETA: ${data.eta} min`,
            data: { screen: 'order_tracking', orderId: data.orderId, event: 'out_for_delivery' }
        }),

        arrivingSoon: (data) => ({
            title: '📍 Driver arriving soon!',
            body: `Your meal is ~${data.distance}m away. Delivery PIN: ${data.pin}`,
            data: { screen: 'order_tracking', orderId: data.orderId, pin: data.pin, event: 'arriving_soon' }
        }),

        delivered: (data) => ({
            title: 'Delivered! Enjoy your meal 🍽️',
            body: `${data.mealName} delivered. How was it? Rate your experience →`,
            data: { screen: 'order_detail', orderId: data.orderId, event: 'delivered' }
        }),

        tomorrowMenu: (data) => ({
            title: `Tomorrow's menu is ready 📋`,
            body: `${data.vendorName} is cooking: ${data.mealName}. Get excited!`,
            data: { screen: 'calendar', event: 'tomorrow_menu' }
        }),

        skipConfirmed: (data) => ({
            title: 'Delivery skipped ✓',
            body: `No delivery on ${data.skipDate}. ₹${data.walletCredit} added to your wallet.`,
            data: { screen: 'wallet', walletBalance: data.walletBalance, event: 'skip_confirmed' }
        }),

        pauseConfirmed: (data) => ({
            title: 'Subscription paused ⏸️',
            body: `Paused until ${data.resumeDate}. Will auto-resume on that date.`,
            data: { screen: 'subscription_detail', resumeDate: data.resumeDate, event: 'pause_confirmed' }
        }),

        subscriptionRenewal: (data) => ({
            title: 'Subscription renewing tomorrow 🔄',
            body: `Your ${data.planName} subscription continues next week. Amount: ₹${data.amount}`,
            data: { screen: 'subscription_detail', event: 'subscription_renewal' }
        }),

        refundProcessed: (data) => ({
            title: `Refund processed ✓`,
            body: `₹${data.amount} refunded to your ${data.method === 'wallet' ? 'wallet' : 'bank account'}.`,
            data: { screen: 'wallet', event: 'refund_processed' }
        }),

        loyaltyEarned: (data) => ({
            title: `+${data.points} loyalty points! ⭐`,
            body: `You've earned points for your delivery. Total: ${data.totalPoints} points.`,
            data: { screen: 'loyalty', event: 'loyalty_earned' }
        }),

        subscriptionCancelled: (data) => ({
            title: 'Subscription cancelled',
            body: `Your subscription has been cancelled. We hope to serve you again soon.`,
            data: { screen: 'home', event: 'subscription_cancelled' }
        })
    },

    // ─── VENDOR NOTIFICATIONS ──────────────────────────────────────────────────
    vendor: {
        applicationApproved: (data) => ({
            title: 'Application approved! 🎉',
            body: `Welcome to DailyMealBox! Your ${data.city} kitchen is now live. Start adding meal plans.`,
            data: { screen: 'dashboard', event: 'application_approved' }
        }),

        applicationRejected: (data) => ({
            title: 'Application update',
            body: `Your application needs attention. Reason: ${data.reason}. Reapply once resolved.`,
            data: { screen: 'documents', reason: data.reason, event: 'application_rejected' }
        }),

        newSubscriber: (data) => ({
            title: 'New subscriber! 🎉',
            body: `${data.customerName} subscribed to ${data.mealPlanName}. Starting ${data.startDate}.`,
            data: { screen: 'subscribers', event: 'new_subscriber' }
        }),

        subscriberCancelled: (data) => ({
            title: 'Subscriber cancelled',
            body: `A subscriber has cancelled. Review your analytics for retention insights.`,
            data: { screen: 'analytics', event: 'subscriber_cancelled' }
        }),

        driverAssigned: (data) => ({
            title: `Driver assigned for ${data.slot}`,
            body: `${data.driverName} will pick up ${data.boxCount} boxes. ETA: ${data.eta}`,
            data: { screen: 'delivery_assignment', driverId: data.driverId, event: 'driver_assigned' }
        }),

        batchCollected: (data) => ({
            title: `Batch collected ✓`,
            body: `${data.driverName} collected ${data.boxCount} boxes at ${data.time}. PIN verified.`,
            data: { screen: 'delivery_tracking', batchId: data.batchId, event: 'batch_collected' }
        }),

        flashDealApproved: (data) => ({
            title: 'Flash deal is LIVE! ⚡',
            body: `${data.discount}% off on ${data.mealName}. Ends at ${data.endsAt}. Track bookings in analytics.`,
            data: { screen: 'analytics', event: 'flash_deal_live' }
        }),

        payoutProcessed: (data) => ({
            title: `Payout processed ✓`,
            body: `₹${data.amount} has been transferred to your bank account.`,
            data: { screen: 'earnings', event: 'payout_processed' }
        }),

        foodLicenceExpiry30Days: (data) => ({
            title: '⚠️ Food licence expiring soon',
            body: `Your food licence expires in 30 days (${data.expiryDate}). Upload renewal to avoid suspension.`,
            data: { screen: 'documents', event: 'food_licence_expiry_30' }
        }),

        foodLicenceExpiry7Days: (data) => ({
            title: '🚨 Food licence expires in 7 days!',
            body: `Upload your renewed licence NOW to avoid automatic suspension on ${data.expiryDate}.`,
            data: { screen: 'documents', event: 'food_licence_expiry_7' }
        }),

        subscriberSkip: (data) => ({
            title: 'Delivery skip received',
            body: `${data.count} customer(s) skipped for ${data.date}. Adjust preparation count.`,
            data: { screen: 'orders', event: 'subscriber_skip', count: data.count, date: data.date }
        }),

        tomorrowForecast: (data) => ({
            title: `Tomorrow: ${data.totalOrders} orders expected 📊`,
            body: `Top item: ${data.topMeal} (${data.topMealCount}). Check ingredient planner.`,
            data: { screen: 'forecast', event: 'tomorrow_forecast' }
        }),

        cutoffApproaching: (data) => ({
            title: `⏰ Cutoff in ${data.minutesLeft} minutes!`,
            body: `${data.remainingOrders} orders still incoming for ${data.slot}. Prepare accordingly.`,
            data: { screen: 'orders', event: 'cutoff_approaching' }
        }),

        vacationModeActivated: (data) => ({
            title: 'Vacation mode activated',
            body: `No new orders until ${data.resumeDate}. Active subscribers notified.`,
            data: { screen: 'settings', event: 'vacation_mode_on' }
        })
    },

    // ─── DRIVER NOTIFICATIONS ──────────────────────────────────────────────────
    driver: {
        applicationApproved: (data) => ({
            title: 'Application approved! 🎉',
            body: `Welcome to DailyMealBox fleet! Start delivering in ${data.city}. Open app to go online.`,
            data: { screen: 'home', event: 'application_approved' }
        }),

        applicationRejected: (data) => ({
            title: 'Application update',
            body: `Documents issue: ${data.reason}. Re-upload and reapply.`,
            data: { screen: 'documents', reason: data.reason, event: 'application_rejected' }
        }),

        vendorReadyWithPin: (data) => ({
            title: `🟢 ${data.boxCount} boxes ready at ${data.vendorName}!`,
            body: `Collection PIN: ${data.pin}. Navigate to vendor now.`,
            data: {
                screen: 'pickup_detail',
                vendor_id: data.vendorId,
                batch_id: data.batchId,
                collection_pin: data.pin,
                box_count: data.boxCount,
                event: 'vendor_ready'
            }
        }),

        newOrderAssigned: (data) => ({
            title: 'New delivery assigned',
            body: `${data.boxCount} boxes to deliver in ${data.zone}. Route updated.`,
            data: { screen: 'route', event: 'new_order_assigned' }
        }),

        routeUpdated: (data) => ({
            title: 'Route updated',
            body: `${data.change}. Check your new route.`,
            data: { screen: 'route', event: 'route_updated' }
        }),

        cashLimitReached: (data) => ({
            title: '⚠️ Cash limit reached!',
            body: `You're holding ₹${data.balance} (limit: ₹${data.limit}). Report to admin before next shift.`,
            data: { screen: 'earnings', event: 'cash_limit_reached' }
        }),

        bonusUnlocked: (data) => ({
            title: '🎁 Bonus unlocked!',
            body: `You completed ${data.deliveries} deliveries. ₹${data.bonus} bonus added.`,
            data: { screen: 'earnings', event: 'bonus_unlocked' }
        }),

        shiftReminder: (data) => ({
            title: `${data.slot} shift starts in 30 min`,
            body: `Go online when ready to start receiving orders for ${data.slot}.`,
            data: { screen: 'home', event: 'shift_reminder' }
        }),

        payoutProcessed: (data) => ({
            title: 'Payout processed ✓',
            body: `₹${data.amount} transferred to your bank account.`,
            data: { screen: 'earnings', event: 'payout_processed' }
        }),

        documentExpiry: (data) => ({
            title: `⚠️ ${data.documentName} expiring in ${data.daysLeft} days`,
            body: `Upload renewal in the Documents section. Expired documents = suspension.`,
            data: { screen: 'documents', event: 'document_expiry' }
        }),

        adminForceOffline: (data) => ({
            title: 'Admin action: Offline',
            body: `You have been taken offline by admin. Reason: ${data.reason}. Contact support.`,
            data: { screen: 'support', event: 'admin_force_offline' }
        }),

        deliveryAssigned: (data) => ({
            title: `Deliver to ${data.customerZone}`,
            body: `Order #${data.orderId} ready for delivery. Tap to navigate.`,
            data: { screen: 'delivery', orderId: data.orderId, event: 'delivery_assigned' }
        })
    }
};

export default notificationCatalogue;
