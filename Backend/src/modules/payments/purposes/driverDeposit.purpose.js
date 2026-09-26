/** refs: none. A driver pays the cash they hold to the platform; the deposit row is written when the money arrives. */
export default {
    async onPaid(tx) {
        const { FoodDeliveryCashDeposit } = await import('../../food/delivery/models/foodDeliveryCashDeposit.model.js');
        const { fromMinor } = await import('../payments.locale.js');
        const existing = await FoodDeliveryCashDeposit.findOne({ paymentTransactionId: tx.publicId }).lean();
        if (existing) return undefined;
        await FoodDeliveryCashDeposit.create({
            deliveryPartnerId: tx.ownerId,
            amount: fromMinor(tx.amountMinor, tx.currency),
            paymentMethod: tx.provider === 'mock' ? 'cash' : tx.provider,
            status: 'Completed',
            razorpayOrderId: tx.providerOrderId || '',
            razorpayPaymentId: tx.providerPaymentId || '',
            paymentTransactionId: tx.publicId
        });
        return undefined;
    }
};
