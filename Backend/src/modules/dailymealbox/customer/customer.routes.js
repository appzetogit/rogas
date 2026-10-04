import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { FoodUser } from '../../../core/users/user.model.js';
import { preferenceCatalogue, effectivePreferences, cleanPreferenceUpdate } from '../notifications/preferences.js';
import { validatePoint } from '../zones/zoneGeo.service.js';
import { isEnabled } from '../platform/platformConfig.service.js';
import { encryptField, safeDecrypt } from '../../../utils/fieldCrypto.js';
import {
    changeSubscriptionAddress, overrideOrderAddress, upcomingDeliveries, updateRotation, findCustomerSubscription
} from '../subscription/subscriptionManage.service.js';
import { replaceSubscriptionSlot } from '../deliverySlot/slotMigration.service.js';

/**
 * Customer endpoints added by Amendment v2 Extra. Mounted at /api/v1/dmb.
 *   /customer/notification-preferences   Gap W (+ marketing consent, Gap I)
 *   /customer/invoice-delivery           Gap J (WhatsApp)
 *   /customer/eco-preference             Gap AI
 *   /customer/zone-check                 Gap U (CA-02 GPS check)
 *   /customer/slot-changes               Gap A (discontinued slots)
 *   /customer/calendar                   Gap AE (10-day preview)
 *   /subscriptions/:id/slot | /address | /rotation | /upcoming
 *   /daily-orders/:orderId/address       Gap V (one-off address)
 */
const router = express.Router();
const customer = [authMiddleware, requireRoles('USER', 'EMPLOYEE')];
const uid = (req) => req.user?.userId || req.user?._id;

const send = (fn) => async (req, res) => {
    try {
        const data = await fn(req);
        res.json({ success: true, ...data });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, code: err.code, message: err.message, details: err.details });
    }
};

// ─── Gap W + I: notification preferences & marketing consent ─────────────────────────────────────────────
router.get('/customer/notification-preferences', ...customer, send(async (req) => {
    const user = await FoodUser.findById(uid(req)).select('notificationPreferences marketingEmailConsent').lean();
    return {
        catalogue: preferenceCatalogue(),
        preferences: effectivePreferences(user?.notificationPreferences),
        marketingEmailConsent: user?.marketingEmailConsent || { granted: false }
    };
}));

router.put('/customer/notification-preferences', ...customer, send(async (req) => {
    const user = await FoodUser.findById(uid(req)).select('notificationPreferences marketingEmailConsent');
    if (!user) throw Object.assign(new Error('User not found'), { statusCode: 404 });
    if (req.body?.preferences) {
        user.notificationPreferences = cleanPreferenceUpdate(user.notificationPreferences, req.body.preferences);
        user.markModified('notificationPreferences');
    }
    if (typeof req.body?.marketingEmailConsent === 'boolean') {
        const granted = req.body.marketingEmailConsent;
        const was = Boolean(user.marketingEmailConsent?.granted);
        if (granted !== was) {
            // GDPR: every change of consent is timestamped.
            user.marketingEmailConsent = granted
                ? { granted: true, at: new Date(), source: 'app_settings', withdrawnAt: null }
                : { granted: false, at: user.marketingEmailConsent?.at || null, source: user.marketingEmailConsent?.source || '', withdrawnAt: new Date() };
        }
    }
    await user.save();
    return { preferences: effectivePreferences(user.notificationPreferences), marketingEmailConsent: user.marketingEmailConsent };
}));

// ─── Gap J: invoice delivery (email / WhatsApp / both) ───────────────────────────────────────────────────
const E164 = /^\+[1-9]\d{7,14}$/;
router.get('/customer/invoice-delivery', ...customer, send(async (req) => {
    const user = await FoodUser.findById(uid(req)).select('whatsappNumber invoiceDeliveryMethod email').lean();
    return {
        whatsappEnabled: await isEnabled('whatsappInvoices'),
        invoiceDeliveryMethod: user?.invoiceDeliveryMethod || 'email',
        whatsappNumber: safeDecrypt(user?.whatsappNumber || ''),
        hasEmail: Boolean(user?.email)
    };
}));

router.put('/customer/invoice-delivery', ...customer, send(async (req) => {
    const method = String(req.body?.invoiceDeliveryMethod || 'email');
    if (!['email', 'whatsapp', 'both'].includes(method)) throw new Error('Choose email, WhatsApp or both');
    const whatsappOn = await isEnabled('whatsappInvoices');
    if (method !== 'email' && !whatsappOn) throw Object.assign(new Error('WhatsApp invoices are not available'), { statusCode: 403, code: 'FEATURE_DISABLED' });
    const number = String(req.body?.whatsappNumber || '').replace(/[\s()-]/g, '');
    if (method !== 'email' && !E164.test(number)) throw Object.assign(new Error('Enter your WhatsApp number in international format, e.g. +48600123456'), { code: 'INVALID_PHONE' });
    const update = { invoiceDeliveryMethod: method };
    if (number) update.whatsappNumber = encryptField(number);
    if (method === 'email' && !number) update.whatsappNumber = '';
    await FoodUser.updateOne({ _id: uid(req) }, { $set: update });
    return { invoiceDeliveryMethod: method, whatsappNumber: number };
}));

// ─── Gap AI: eco preference (ranking boost only) ─────────────────────────────────────────────────────────
router.put('/customer/eco-preference', ...customer, send(async (req) => {
    const ecoPreference = Boolean(req.body?.ecoPreference);
    await FoodUser.updateOne({ _id: uid(req) }, { $set: { ecoPreference } });
    return { ecoPreference };
}));

// ─── Gap U: zone check for onboarding GPS (CA-02) — public so it works before sign-up ─────────────────────
router.post('/customer/zone-check', send(async (req) => {
    const lat = Number(req.body?.lat ?? req.body?.latitude);
    const lng = Number(req.body?.lng ?? req.body?.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('lat and lng are required');
    const source = ['onboarding', 'address_add', 'checkout', 'select'].includes(req.body?.source) ? req.body.source : 'onboarding';
    return { result: await validatePoint({ lat, lng, source, city: req.body?.city || '' }) };
}));

// ─── Gap A: subscriptions whose slot is being discontinued ───────────────────────────────────────────────
router.get('/customer/slot-changes', ...customer, send(async (req) => {
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const { listSlots } = await import('../deliverySlot/deliverySlot.service.js');
    const subs = await DMBSubscription.find({ userId: uid(req), needsSlotChange: true, status: { $in: ['active', 'paused', 'pending_payment'] } })
        .select('subscriptionId slotChangeKeys deliverySlots vendorId').populate('vendorId', 'restaurantName').lean();
    const slots = await listSlots();
    return {
        subscriptions: subs.map((s) => ({
            subscriptionId: s.subscriptionId, _id: s._id, vendorName: s.vendorId?.restaurantName || '',
            discontinued: (s.slotChangeKeys || []).map((k) => {
                const slot = slots.find((x) => x.key === k);
                return { key: k, name: slot?.name || k, graceEndsAt: slot?.graceEndsAt || null, fallbackSlotKey: slot?.fallbackSlotKey || '' };
            })
        })),
        options: slots.filter((s) => s.status === 'active').map((s) => ({ key: s.key, name: s.name, icon: s.icon, startTime: s.startTime, endTime: s.endTime }))
    };
}));

router.patch('/subscriptions/:id/slot', ...customer, send(async (req) => ({
    subscription: await replaceSubscriptionSlot({ userId: uid(req), subscriptionId: req.params.id, fromSlot: req.body?.fromSlot, toSlot: req.body?.toSlot })
})));

// ─── Gap U/V: change a subscription's address (whole or per weekday) ─────────────────────────────────────
router.patch('/subscriptions/:id/address', ...customer, send(async (req) => ({
    subscription: await changeSubscriptionAddress({ userId: uid(req), subscriptionId: req.params.id, addressId: req.body?.addressId, days: req.body?.days })
})));

// ─── Gap V: one-off address for a single delivery ────────────────────────────────────────────────────────
router.patch('/daily-orders/:orderId/address', ...customer, send(async (req) => ({
    order: await overrideOrderAddress({ userId: uid(req), orderId: req.params.orderId, addressId: req.body?.addressId })
})));

// ─── Gap AE: 10-day calendar ─────────────────────────────────────────────────────────────────────────────
router.get('/customer/calendar', ...customer, send(async (req) => {
    const { ensureOrdersForUser } = await import('../subscription/dmb.dailyOrder.service.js');
    await ensureOrdersForUser(uid(req));
    return upcomingDeliveries({ userId: uid(req), days: req.query.days });
}));
router.get('/subscriptions/:id/upcoming', ...customer, send(async (req) => {
    const { ensureOrdersForUser } = await import('../subscription/dmb.dailyOrder.service.js');
    await ensureOrdersForUser(uid(req));
    return upcomingDeliveries({ userId: uid(req), subscriptionId: req.params.id, days: req.query.days });
}));

// ─── Gap AK: edit rotation (next cycle) ──────────────────────────────────────────────────────────────────
router.patch('/subscriptions/:id/rotation', ...customer, send(async (req) => updateRotation({ userId: uid(req), subscriptionId: req.params.id, rotation: req.body?.rotation })));

// ─── Subscription detail incl. amendment fields (plan change, rotation, family, trial) ──────────────────
router.get('/subscriptions/:id/detail', ...customer, send(async (req) => {
    const sub = await findCustomerSubscription(uid(req), req.params.id);
    await sub.populate([{ path: 'vendorId', select: 'restaurantName profileImage' }, { path: 'rotation.vendorId', select: 'restaurantName' }, { path: 'meals.mealPlanId', select: 'name pricePerDay photos' }]);
    const s = sub.toObject();
    return {
        subscription: {
            ...s,
            displayStatus: s.cancelAt && s.status === 'active' ? 'cancelling' : s.status,
            cancelRequested: Boolean(s.cancelRequestedAt),
            lastDeliveryDate: s.cancelRequestedAt && s.cancelAt ? new Date(new Date(s.cancelAt).getTime() - 86_400_000).toISOString().slice(0, 10) : null,
            quote: s.quote ? { lines: s.quote.lines, totals: s.quote.totals, currency: s.quote.currency, discounts: s.quote.discounts, cycle: s.quote.cycle } : null
        }
    };
}));

// ─── Gap X + AI/AJ/AH/AL/AK: zone-enforced Plans browse ────────────────────────────────────────────────
router.get('/browse/vendors', async (req, res) => {
    try {
        const { browseVendors } = await import('./browse.service.js');
        // Optional auth: a signed-in customer gets the eco-preference ranking boost.
        let userId = null;
        try {
            const token = (req.headers.authorization || '').replace(/^Bearer /, '');
            if (token) userId = (await import('../../../core/auth/token.util.js')).verifyAccessToken(token)?.userId || null;
        } catch { /* anonymous browse */ }
        const { zoneId, ...filters } = req.query;
        res.json({ success: true, ...(await browseVendors({ zoneId: zoneId || req.zoneId, filters, userId })) });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, code: err.code, message: err.message });
    }
});
router.get('/browse/vendors/:vendorId/meals', send(async (req) => {
    const { vendorMeals } = await import('./browse.service.js');
    return vendorMeals({ vendorId: req.params.vendorId, zoneId: req.query.zoneId || req.zoneId });
}));

// ─── Gap AG: Select mode (single meal, no subscription) ───────────────────────────────────────────────
router.get('/select/meals', send(async (req) => {
    const { browseSelectMeals } = await import('../orders/oneTimeOrder.service.js');
    return browseSelectMeals({ zoneId: req.query.zoneId || req.zoneId, date: req.query.date, slot: req.query.slot, filters: { temperature: req.query.temperature } });
}));
router.post('/select/orders', ...customer, send(async (req) => {
    const svc = await import('../orders/oneTimeOrder.service.js');
    const order = await svc.createSelectOrder({ userId: uid(req), mealPlanId: req.body?.mealPlanId, quantity: req.body?.quantity, date: req.body?.date, slot: req.body?.slot, addressId: req.body?.addressId });
    if (req.body?.expectedTotal !== undefined && Math.abs(Number(req.body.expectedTotal) - order.pricing.totalPrice) > 0.01) {
        const { DMBOneTimeOrder } = await import('../orders/orders.models.js');
        await DMBOneTimeOrder.deleteOne({ _id: order._id });
        throw Object.assign(new Error('The price has changed. Please review and confirm again.'), { statusCode: 409, code: 'PRICE_CHANGED', details: { pricing: order.pricing } });
    }
    try {
        const payment = await svc.startOneTimePayment({ userId: uid(req), order, provider: req.body?.provider, returnPath: req.body?.returnPath, cancelPath: req.body?.cancelPath, language: req.body?.language });
        return { order, payment };
    } catch (err) {
        const { DMBOneTimeOrder } = await import('../orders/orders.models.js');
        await DMBOneTimeOrder.deleteOne({ _id: order._id, status: 'pending_payment' });
        throw err;
    }
}));

// ─── Gap M: pre-orders ────────────────────────────────────────────────────────────────────────────────
router.post('/preorders', ...customer, send(async (req) => {
    const { reservePreOrder } = await import('../orders/oneTimeOrder.service.js');
    return { reservation: await reservePreOrder({ userId: uid(req), mealPlanId: req.body?.mealPlanId, quantity: req.body?.quantity, slot: req.body?.slot, addressId: req.body?.addressId }) };
}));
router.delete('/preorders/:id', ...customer, send(async (req) => {
    const { cancelPreOrder } = await import('../orders/oneTimeOrder.service.js');
    return { reservation: await cancelPreOrder({ userId: uid(req), id: req.params.id }) };
}));
router.post('/preorders/:id/pay', ...customer, send(async (req) => {
    const { DMBOneTimeOrder } = await import('../orders/orders.models.js');
    const order = await DMBOneTimeOrder.findOne({ _id: req.params.id, userId: uid(req), type: 'pre_order', status: 'payment_pending' }).lean();
    if (!order) throw Object.assign(new Error('Nothing to pay for this reservation'), { statusCode: 404 });
    const { startOneTimePayment } = await import('../orders/oneTimeOrder.service.js');
    return { payment: await startOneTimePayment({ userId: uid(req), order, provider: req.body?.provider, returnPath: req.body?.returnPath, cancelPath: req.body?.cancelPath, language: req.body?.language }) };
}));
router.get('/customer/one-time-orders', ...customer, send(async (req) => {
    const { myOneTimeOrders } = await import('../orders/oneTimeOrder.service.js');
    return { orders: await myOneTimeOrders(uid(req), req.query.type) };
}));

// ─── Gap AK: makers available for a Smart Rotation in the customer's zone ──────────────────────────────
router.get('/rotation/vendors', send(async (req) => {
    const { browseVendors } = await import('./browse.service.js');
    const res = await browseVendors({ zoneId: req.query.zoneId || req.zoneId, filters: { rotation: 'true' } });
    return { enabled: res.filtersAvailable.rotation, vendors: res.vendors };
}));

// ─── Amendment 1 #17: GDPR account deletion request (30-day deadline) ────────────────────────────────
router.post('/gdpr/deletion-request', ...customer, send(async (req) => {
    const { requestDeletion } = await import('../gdpr/gdpr.service.js');
    const { request, alreadyRequested } = await requestDeletion(uid(req));
    return { alreadyRequested, requestedAt: request.requestedAt, dueAt: request.dueAt };
}));
router.get('/gdpr/status', ...customer, send(async (req) => {
    const { statusForUser } = await import('../gdpr/gdpr.service.js');
    return statusForUser(uid(req));
}));

// ─── Gap AC: legal documents (all app roles) ───────────────────────────────────────────────────────────
router.get('/legal/documents/:docType', send(async (req) => {
    const { publicDocument } = await import('../legal/legal.service.js');
    return { document: await publicDocument(req.params.docType, req.query.lang) };
}));
router.get('/legal/pending', authMiddleware, send(async (req) => {
    const { pendingForUser } = await import('../legal/legal.service.js');
    return { pending: await pendingForUser({ role: req.user.role, userId: uid(req), language: req.query.lang }) };
}));
router.post('/legal/accept', authMiddleware, send(async (req) => {
    const { accept } = await import('../legal/legal.service.js');
    return accept({ role: req.user.role, userId: uid(req), docType: req.body?.docType, version: req.body?.version, language: req.body?.language, ip: req.ip, userAgent: req.headers['user-agent'] });
}));

// ─── Signed invoice download (WhatsApp / email attachments fetch it without a login) ────────────────────
router.get('/invoices/:subscriptionId/pdf', async (req, res) => {
    try {
        const { verifyInvoiceLink, generateInvoicePdf } = await import('../../food/user/services/invoice.service.js');
        const { u, exp, sig } = req.query;
        if (!verifyInvoiceLink({ subscriptionId: req.params.subscriptionId, u, exp, sig })) return res.status(403).json({ success: false, message: 'This link is invalid or has expired' });
        const doc = await generateInvoicePdf(req.params.subscriptionId, { _id: u });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename=Invoice-${req.params.subscriptionId}.pdf`);
        doc.pipe(res);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

export default router;
