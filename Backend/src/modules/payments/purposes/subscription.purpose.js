/** refs: { subscriptionId } (the business id, e.g. "SUB-..."). */
export default {
    async onPaid(tx) {
        const { DMBSubscription } = await import('../../dailymealbox/subscription/subscription.model.js');
        const { activateSubscription } = await import('../../dailymealbox/subscription/subscription.service.js');
        const subscriptionId = tx.refs?.subscriptionId;
        const sub = await DMBSubscription.findOne({ subscriptionId });
        if (!sub) throw new Error(`Subscription ${subscriptionId} not found`);
        if (sub.status === 'active') return undefined; // already activated
        if (sub.status !== 'pending_payment') {
            return { attention: `Subscription ${subscriptionId} is "${sub.status}" but its payment arrived; refund or reinstate it manually` };
        }
        await activateSubscription(subscriptionId);
        // Invoice delivery (CA-v2-07 + Gap J): email and/or WhatsApp, as the customer chose. Never blocks activation.
        try {
            const { deliverSubscriptionInvoice } = await import('../../dailymealbox/integrations/invoiceDelivery.js');
            await deliverSubscriptionInvoice(sub._id);
        } catch { /* logged inside */ }
        return undefined;
    },

    async onFailed(tx) {
        // The order stays "pending_payment" so the customer can simply try again; only the denormalised user flag is reset.
        const { DMBSubscription } = await import('../../dailymealbox/subscription/subscription.model.js');
        const { FoodUser } = await import('../../../core/users/user.model.js');
        const sub = await DMBSubscription.findOne({ subscriptionId: tx.refs?.subscriptionId }).select('userId status').lean();
        if (!sub || sub.status !== 'pending_payment') return;
        const other = await DMBSubscription.exists({ userId: sub.userId, status: { $in: ['active', 'paused'] } });
        if (!other) await FoodUser.updateOne({ _id: sub.userId, subscriptionStatus: 'active' }, { subscriptionStatus: 'none' });
    }
};
