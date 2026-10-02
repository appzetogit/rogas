import { logger } from '../../../utils/logger.js';

/**
 * Sends a paid subscription's receipt / VAT invoice the way the customer chose (CA-v2-07):
 *   email     → PDF attached (fetched through a signed link; needs API_PUBLIC_URL)
 *   whatsapp  → PDF document on WhatsApp (Gap J, ACM-156)
 *   both      → both
 */
export const deliverSubscriptionInvoice = async (subscriptionId) => {
    try {
        const { DMBSubscription } = await import('../subscription/subscription.model.js');
        const { FoodUser } = await import('../../../core/users/user.model.js');
        const sub = await DMBSubscription.findById(subscriptionId).lean();
        if (!sub || sub.status === 'pending_payment') return { sent: false };
        const user = await FoodUser.findById(sub.userId).select('email invoiceDeliveryMethod').lean();
        const method = user?.invoiceDeliveryMethod || 'email';
        const result = { email: false, whatsapp: false };

        if (['email', 'both'].includes(method)) {
            const to = sub.billingEmail || user?.email;
            if (to) {
                const { signInvoiceLink } = await import('../../food/user/services/invoice.service.js');
                const { queueEmail } = await import('../../email/email.service.js');
                const link = process.env.API_PUBLIC_URL ? signInvoiceLink(String(sub._id), String(sub.userId)).url : '';
                await queueEmail({
                    to,
                    subjectKey: 'Your DailyMealBox invoice {{number}}',
                    bodyKey: 'Thank you for your order. Your invoice {{number}} is attached. You can also download it any time from your subscription in the app.',
                    vars: { number: `INV-${sub.subscriptionId}` },
                    ownerType: 'USER',
                    ownerId: sub.userId,
                    attachments: link ? [{ filename: `INV-${sub.subscriptionId}.pdf`, path: link }] : []
                });
                result.email = true;
            }
        }
        if (['whatsapp', 'both'].includes(method)) {
            const { sendInvoiceOnWhatsApp } = await import('./whatsapp.service.js');
            result.whatsapp = (await sendInvoiceOnWhatsApp({ userId: sub.userId, subscription: sub })).queued;
        }
        return result;
    } catch (err) {
        logger.warn(`[invoice] delivery for ${subscriptionId} failed: ${err.message}`);
        return { sent: false };
    }
};
