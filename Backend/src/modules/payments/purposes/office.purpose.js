/** refs: { officePaymentId }. Delivering means creating the employees' meal assignments and subscriptions. */
export default {
    async onPaid(tx) {
        const { fulfilOfficePayment } = await import('../../dailymealbox/office/office.assignment.service.js');
        const { attention } = await fulfilOfficePayment(tx.refs?.officePaymentId, { paymentTxId: tx.publicId, providerPaymentId: tx.providerPaymentId });
        // Employees who could not be served were still paid for: flag the payment so an admin refunds or fixes them.
        return attention ? { attention } : undefined;
    },

    async onFailed(tx) {
        const { OfficePayment } = await import('../../dailymealbox/office/models/officePayment.model.js');
        await OfficePayment.updateOne({ _id: tx.refs?.officePaymentId, status: 'pending' }, { $set: { status: 'failed' } });
    }
};
