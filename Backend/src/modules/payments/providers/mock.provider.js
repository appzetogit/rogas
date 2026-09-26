import { paymentsMode } from '../payments.config.js';

/** Development-only "pay" button that succeeds instantly. Only exists when PAYMENTS_MODE=mock and NODE_ENV is not production. */
export const mockProvider = {
    id: 'mock',
    label: 'Test payment',
    supportsCurrency: () => true,
    isConfigured: () => paymentsMode() === 'mock',
    mode: () => 'mock',
    async createPayment(tx) {
        return { providerOrderId: tx.publicId, providerData: {}, action: { type: 'mock' } };
    },
    async getStatus() {
        return { state: 'pending' };
    },
    async testConnection() {
        return paymentsMode() === 'mock' ? { ok: true, message: 'Mock payments are enabled (development only)' } : { ok: false, message: 'Mock payments are off' };
    }
};
