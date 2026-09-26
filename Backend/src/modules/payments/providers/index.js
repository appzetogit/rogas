import { przelewy24Provider } from './przelewy24.provider.js';
import { stripeProvider } from './stripe.provider.js';
import { razorpayProvider } from './razorpay.provider.js';
import { mockProvider } from './mock.provider.js';

const REGISTRY = {
    przelewy24: przelewy24Provider,
    stripe: stripeProvider,
    razorpay: razorpayProvider,
    mock: mockProvider
};

/** The three real providers the admin can switch on and off. */
export const SWITCHABLE_PROVIDERS = ['razorpay', 'przelewy24', 'stripe'];

export const getProvider = (id) => {
    const provider = REGISTRY[id];
    if (!provider) throw new Error(`Unknown payment provider "${id}"`);
    return provider;
};

export const isKnownProvider = (id) => Object.prototype.hasOwnProperty.call(REGISTRY, id);
