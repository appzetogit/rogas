/** refs: { officePaymentId }. Delivering means creating the employees' meal assignments and subscriptions. */
export default {
    async onPaid(tx) {
        const { fulfilOfficePayment } = await import('../../dailymealbox/office/office.assignment.service.js');
        await fulfilOfficePayment(tx.refs?.officePaymentId, { paymentTxId: tx.publicId, providerPaymentId: tx.providerPaymentId });
        return undefined;
    },

    async onFailed(tx) {
        const { OfficePayment } = await import('../../dailymealbox/office/models/officePayment.model.js');
        await OfficePayment.updateOne({ _id: tx.refs?.officePaymentId, status: 'pending' }, { $set: { status: 'failed' } });
    }
};
