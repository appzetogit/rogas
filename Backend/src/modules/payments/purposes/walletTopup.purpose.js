/** refs: none. The credited amount is always the one WE stored on the payment, never a number sent by the browser. */
export default {
    async onPaid(tx) {
        const { creditWalletFromPayment } = await import('../../food/user/services/userWallet.service.js');
        const { fromMinor } = await import('../payments.locale.js');
        await creditWalletFromPayment(String(tx.ownerId), fromMinor(tx.amountMinor, tx.currency), {
            paymentTxId: tx.publicId,
            provider: tx.provider,
            providerOrderId: tx.providerOrderId,
            providerPaymentId: tx.providerPaymentId,
            currency: tx.currency
        });
    }
};
