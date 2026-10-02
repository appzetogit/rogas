/** refs: { oneTimeOrderId } — a Select-mode meal (Gap AG) or a launch-day pre-order payment (Gap M). */
export default {
    async onPaid(tx) {
        const { oneTimePurpose } = await import('../../dailymealbox/orders/oneTimeOrder.service.js');
        return oneTimePurpose.onPaid(tx);
    },
    async onFailed(tx) {
        const { oneTimePurpose } = await import('../../dailymealbox/orders/oneTimeOrder.service.js');
        return oneTimePurpose.onFailed(tx);
    }
};
