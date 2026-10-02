import { registerJob } from './jobRunner.js';
import { dailyAt, monthlyAt, every } from './schedules.js';

/**
 * The SOP's "CRON" items, registered with the cluster-safe job runner (jobRunner.js). Times are platform local time.
 * Every job body lives in its feature module; this file only says *when*.
 */
const lazy = (path, fn) => async (now) => (await import(path))[fn](now);

export const registerAmendmentJobs = () => {
    // Gap A — discontinued slots: move remaining subscribers once the 14-day grace period ends.
    registerJob({ name: 'slot-migration', description: 'Move subscribers off retired delivery slots', ...every(60), run: lazy('../deliverySlot/slotMigration.service.js', 'migrateExpiredSlots') });

    // Gap G — holiday announcements 7 and 3 days ahead (also applies confirmed holidays not yet applied).
    registerJob({ name: 'holiday-notices', description: 'Announce platform holidays to customers, vendors and drivers', ...every(60), run: lazy('./holiday.service.js', 'sendHolidayNotices') });

    // Subscription lifecycle: end, auto-resume, renewal reminders.
    registerJob({ name: 'subscription-expiry', description: 'Expire subscriptions whose period ended', ...dailyAt('00:10'), run: lazy('../subscription/subscriptionCheckout.service.js', 'expireEndedSubscriptions') });
    registerJob({ name: 'pause-auto-resume', description: 'Resume subscriptions whose pause ended', ...every(15), run: lazy('../subscription/subscription.service.js', 'autoResumePausedSubscriptions') });
    registerJob({ name: 'renewal-reminders', description: 'Remind customers before their subscription ends (annual: 30 days)', ...dailyAt('10:00'), run: lazy('../subscription/renewal.service.js', 'sendRenewalReminders') });
    registerJob({ name: 'daily-orders', description: "Create today's and tomorrow's subscription orders", ...every(60), run: lazy('../subscription/orderGeneration.js', 'generateUpcomingOrders') });

    // Gap E / M — stock alerts and pre-order launches.
    registerJob({ name: 'low-stock', description: 'Alert vendors whose prepared stock is running low', ...every(15), run: lazy('../orders/stock.service.js', 'lowStockSweep') });
    registerJob({ name: 'preorder-launch', description: 'Launch pre-order meals on their launch date', ...dailyAt('00:01'), run: lazy('../orders/oneTimeOrder.service.js', 'processLaunches') });

    // Gap AB — monthly settlement statements (cooks and fleet partners), previous month.
    registerJob({ name: 'monthly-settlements', description: 'Generate monthly settlement statements', ...monthlyAt(1, '06:00'), run: lazy('../vendor/settlement.service.js', 'generateMonthlySettlements') });

    // Gap F / I / W — customer risk, marketing sync, WhatsApp retries.
    registerJob({ name: 'bad-debt-check', description: 'Flag customers matching the bad-debt rules', ...dailyAt('03:00'), run: lazy('../customer/customerAdmin.service.js', 'runBadDebtCheck') });
    registerJob({ name: 'mailchimp-sync', description: 'Sync opted-in customers to Mailchimp', ...dailyAt('04:00'), run: lazy('../integrations/mailchimp.service.js', 'runMailchimpSync') });
    registerJob({ name: 'whatsapp-retry', description: 'Retry failed WhatsApp invoice messages', ...every(15), run: lazy('../integrations/whatsapp.service.js', 'retryFailedWhatsApp') });

    // Gap AA / AH / AE — home-cook compliance, specialist badges, menu reminders.
    registerJob({ name: 'track1-threshold', description: 'Warn home cooks approaching the Track 1 revenue limit', ...dailyAt('07:00'), run: lazy('../vendor/vendorAmendment.service.js', 'track1ThresholdCheck') });
    registerJob({ name: 'sanepid-grace', description: 'Remind and pause home cooks without a Sanepid registration', ...dailyAt('08:00'), run: lazy('../vendor/vendorAmendment.service.js', 'sanepidGraceCheck') });
    registerJob({ name: 'specialism-expiry', description: 'Expire specialist badges past their validity', ...dailyAt('09:00'), run: lazy('../vendor/vendorAmendment.service.js', 'specialismExpiryCheck') });
    registerJob({ name: 'menu-reminders', description: 'Remind vendors to publish upcoming menus', ...dailyAt('10:00'), run: lazy('../vendor/vendorAmendment.service.js', 'menuReminderSweep') });
};
