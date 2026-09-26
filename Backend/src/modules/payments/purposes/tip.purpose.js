/** refs: { tipTransactionId } */
export default {
    async onPaid(tx) {
        const { FoodDeliveryTipTransaction, DMBDailyOrder } = await import('../../dailymealbox/subscription/dmb.dailyOrder.model.js');
        // Atomic pending -> completed so the tip is added to the order exactly once.
        const tip = await FoodDeliveryTipTransaction.findOneAndUpdate(
            { _id: tx.refs?.tipTransactionId, status: { $in: ['pending', 'failed'] } },
            { $set: { status: 'completed', razorpayPaymentId: tx.providerPaymentId || tx.publicId } },
            { new: true }
        );
        if (!tip) return undefined; // already completed
        await DMBDailyOrder.updateOne({ _id: tip.orderId }, { $inc: { driverTip: tip.amount } });
        return undefined;
    },

    async onFailed(tx) {
        const { FoodDeliveryTipTransaction } = await import('../../dailymealbox/subscription/dmb.dailyOrder.model.js');
        await FoodDeliveryTipTransaction.updateOne({ _id: tx.refs?.tipTransactionId, status: 'pending' }, { $set: { status: 'failed' } });
    }
};
