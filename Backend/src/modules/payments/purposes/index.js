/**
 * A "purpose" says what happens when a payment settles. Handlers must be idempotent: the payments service already
 * guarantees one delivery per payment, but a crash between the domain write and the bookkeeping can replay it.
 *
 *   onPaid(tx)            -> deliver what was paid for. Return { attention: '...' } when money arrived but the order
 *                            can no longer be honoured (an operator must decide, e.g. refund); throw to retry later.
 *   onFailed(tx, state)   -> optional cleanup when the customer never paid ('failed' | 'expired' | 'cancelled').
 */
import subscription from './subscription.purpose.js';
import pantry from './pantry.purpose.js';
import walletTopup from './walletTopup.purpose.js';
import tip from './tip.purpose.js';
import office from './office.purpose.js';
import driverDeposit from './driverDeposit.purpose.js';
import oneTimeOrder from './oneTimeOrder.purpose.js';

const HANDLERS = {
    subscription,
    pantry,
    wallet_topup: walletTopup,
    tip,
    office,
    driver_deposit: driverDeposit,
    one_time_order: oneTimeOrder
};

export const getPurpose = (purpose) => {
    const handler = HANDLERS[purpose];
    if (!handler) throw new Error(`No handler registered for payment purpose "${purpose}"`);
    return handler;
};
