import { DMBSubscription } from './subscription.model.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { addDays, localToday, storageDateStr } from '../../../utils/platformTime.js';

/**
 * Renewal reminders. Payment is collected per period (no stored cards), so the customer renews from the app
 * ("Renew" = same plan for the next period). Annual plans are reminded 30 days before they end (Gap C);
 * monthly 3 days and weekly/fortnightly 2 days before.
 */
const LEAD_DAYS = { annual: 30, monthly: 3, fortnightly: 2, weekly: 2 };

export const sendRenewalReminders = async (now = new Date()) => {
    const today = localToday(now);
    let sent = 0;
    for (const [cycle, lead] of Object.entries(LEAD_DAYS)) {
        const target = addDays(today, lead);
        const subs = await DMBSubscription.find({
            status: 'active',
            $or: [{ billingCycle: cycle }, { billingCycle: null, duration: cycle }],
            endDate: { $gte: target, $lt: addDays(target, 1) },
            renewalReminderSentAt: null,
            renewedBySubscriptionId: null,
            replacedBySubscriptionId: null,
            source: { $ne: 'office' }
        }).select('userId subscriptionId endDate').lean();
        for (const sub of subs) {
            await DMBSubscription.updateOne({ _id: sub._id }, { $set: { renewalReminderSentAt: now } });
            const vars = { date: storageDateStr(sub.endDate), days: lead };
            await notify({
                to: 'customer', id: sub.userId, event: 'renewal_reminder',
                title: msg('Your subscription ends on {{date}}', vars),
                body: msg('Renew now so your meals keep coming without a break.'),
                link: '/user/profile', data: { subscriptionId: sub.subscriptionId },
                email: cycle === 'annual' ? {
                    subjectKey: 'Your annual DailyMealBox plan ends on {{date}}',
                    bodyKey: 'Your annual plan ends on {{date}}. Renew from the app before then to keep your deliveries and your annual price.',
                    vars
                } : null
            });
            sent++;
        }
    }
    return { sent };
};
