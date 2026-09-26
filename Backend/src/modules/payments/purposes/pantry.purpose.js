/** refs: { orderIds: ["PO-XXXXXX", ...] }: one payment can settle several pantry orders (one per date/slot group). */
export default {
    async onPaid(tx) {
        const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
        const orderIds = tx.refs?.orderIds || [];
        if (!orderIds.length) throw new Error('Payment has no pantry orders attached');
        await PantryOrder.updateMany(
            { orderId: { $in: orderIds }, status: 'pending_payment' },
            { $set: { status: 'paid', paymentId: tx.providerPaymentId || tx.publicId, paymentOrderId: tx.providerOrderId || tx.publicId, paymentStatus: 'completed' } }
        );
        const missing = await PantryOrder.countDocuments({ orderId: { $in: orderIds }, status: 'cancelled' });
        return missing ? { attention: `${missing} pantry order(s) were cancelled before their payment arrived` } : undefined;
    },

    async onFailed(tx) {
        const { PantryOrder } = await import('../../food/restaurant/models/pantryOrder.model.js');
        await PantryOrder.updateMany({ orderId: { $in: tx.refs?.orderIds || [] }, status: 'pending_payment' }, { $set: { status: 'cancelled', paymentStatus: 'failed' } });
    }
};
