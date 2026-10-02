import express from 'express';
import { authMiddleware } from '../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../core/roles/role.middleware.js';
import { getControl, isEnabled } from '../platform/platformConfig.service.js';
import * as va from './vendorAmendment.service.js';
import * as settlements from './settlement.service.js';
import * as stock from '../orders/stock.service.js';
import { preOrderDemand } from '../orders/oneTimeOrder.service.js';
import { listVendorReviews, respondToReview } from '../ratings/ratings.service.js';
import { pantryReturnsForVendor, markReturnRestocked } from '../orders/pantryReturns.service.js';

/** Vendor app endpoints added by Amendment v2 Extra. Mounted at /api/v1/dmb (paths start with /vendor/). */
const router = express.Router();
const vendor = [authMiddleware, requireRoles('RESTAURANT')];
const vid = (req) => req.user?.userId || req.user?._id;

const send = (fn) => async (req, res) => {
    try {
        const data = await fn(req, res);
        if (!res.headersSent) res.json({ success: true, ...data });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, code: err.code, message: err.message, details: err.details });
    }
};

/** Everything the vendor app needs to decide which new sections to show. */
router.get('/vendor/amendment-config', ...vendor, send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const v = await FoodRestaurant.findById(vid(req)).select('zoneId vendorType cookTrack').lean();
    const ctx = { zoneId: v?.zoneId };
    const [weekend, temperatureLabels, temperatureMandatory, ecoVerification] = await Promise.all([
        getControl('weekendDelivery', ctx), getControl('temperatureLabels', ctx), getControl('temperatureMandatory', ctx), getControl('ecoBadgeVerification', ctx)
    ]);
    return {
        config: {
            vendorType: v?.vendorType, cookTrack: v?.cookTrack || null,
            reviewResponses: await isEnabled('vendorReviewResponses', ctx),
            track1Available: await isEnabled('homeCookTrack1', ctx),
            specialismsOpen: await isEnabled('medicalSpecialisms', ctx),
            preferredFleetRequests: await isEnabled('preferredFleetRequests', ctx),
            settlementStatements: await isEnabled('settlementStatements', ctx),
            weekend, temperatureDisplay: temperatureLabels.display, temperatureMandatory: temperatureMandatory.enabled,
            ecoVerificationRequired: ecoVerification.required,
            calendarPreviewDays: (await getControl('calendarPreviewDays')).days
        }
    };
}));

// ─── Gap T: reviews & responses (VM-09) ──────────────────────────────────────────────────────────────────
router.get('/vendor/reviews', ...vendor, send(async (req) => listVendorReviews(vid(req), { page: req.query.page, limit: req.query.limit, filter: req.query.filter })));
router.post('/vendor/reviews/:orderId/response', ...vendor, send(async (req) => ({ response: await respondToReview({ vendorId: vid(req), orderId: req.params.orderId, text: req.body?.text }) })));

// ─── Gap E: live stock ───────────────────────────────────────────────────────────────────────────────────
router.get('/vendor/stock', ...vendor, send(async (req) => stock.vendorStock(vid(req), { date: req.query.date })));
router.put('/vendor/stock/:mealPlanId', ...vendor, send(async (req) => ({ stock: await stock.setAvailable(vid(req), req.params.mealPlanId, { available: req.body?.available, date: req.body?.date }) })));
router.post('/vendor/stock/:mealPlanId/prepared', ...vendor, send(async (req) => ({ stock: await stock.recordPrepared(vid(req), req.params.mealPlanId, { delta: req.body?.delta, value: req.body?.value, date: req.body?.date }) })));

// ─── Gap M: pre-order demand (VM-NEW-01 forecast) ────────────────────────────────────────────────────────
router.get('/vendor/preorder-demand', ...vendor, send(async (req) => ({ demand: await preOrderDemand(vid(req)) })));

// ─── Gap AA: two-track home cook ─────────────────────────────────────────────────────────────────────────
router.get('/vendor/cook-track', ...vendor, send(async (req) => ({ track: await va.trackOverview(vid(req)) })));
router.post('/vendor/cook-track', ...vendor, send(async (req) => ({ track: await va.selectTrack(vid(req), req.body || {}) })));
router.put('/vendor/cook-track/kitchen-photos', ...vendor, send(async (req) => ({ track: await va.saveKitchenPhotos(vid(req), req.body?.urls) })));
router.put('/vendor/cook-track/sanepid', ...vendor, send(async (req) => ({ track: await va.saveSanepidDocument(vid(req), req.body?.url) })));

// ─── Gap AB: settlement statements (Track 1) ─────────────────────────────────────────────────────────────
router.get('/vendor/settlements', ...vendor, send(async (req) => ({
    settlements: await settlements.listSettlements('cook', vid(req)),
    currentMonth: await settlements.currentMonthRunning(vid(req))
})));
router.get('/vendor/settlements/:period/pdf', ...vendor, async (req, res) => {
    try {
        const { DMBSettlement, renderSettlementPdf } = settlements;
        const s = await DMBSettlement.findOne({ entityType: 'cook', entityId: vid(req), period: req.params.period }).lean();
        if (!s) return res.status(404).json({ success: false, message: 'Statement not found' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Rozliczenie-${s.period}.pdf`);
        renderSettlementPdf(s).pipe(res);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});
router.get('/vendor/settlements/annual/:year/pdf', ...vendor, async (req, res) => {
    try {
        const year = String(Number(req.params.year));
        const rows = await settlements.DMBSettlement.find({ entityType: 'cook', entityId: vid(req), period: { $regex: `^${year}-` } }).sort({ period: 1 }).lean();
        if (!rows.length) return res.status(404).json({ success: false, message: 'No statements for that year' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=Rozliczenie-${year}-annual.pdf`);
        settlements.renderAnnualPdf({ name: rows[0].entityName, label: 'Cook' }, year, rows).pipe(res);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Gap AD: preferred delivery partner (VM-12) ──────────────────────────────────────────────────────────
router.get('/vendor/delivery-partner', ...vendor, send(async (req) => ({ deliveryPartner: await va.deliveryPartnerStatus(vid(req)) })));
router.post('/vendor/delivery-partner', ...vendor, send(async (req) => ({ request: await va.requestPreferredPartner(vid(req), req.body || {}) })));
router.delete('/vendor/delivery-partner/request', ...vendor, send(async (req) => ({ deliveryPartner: await va.withdrawPartnerRequest(vid(req)) })));

// ─── Gap AI: eco packaging (VM-02 / VM-12) ───────────────────────────────────────────────────────────────
router.get('/vendor/eco-packaging', ...vendor, send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const v = await FoodRestaurant.findById(vid(req)).select('ecoPackaging zoneId').lean();
    return { ecoPackaging: v?.ecoPackaging || { enabled: false }, badgeVisible: await va.ecoBadgeVisible(v), verificationRequired: (await getControl('ecoBadgeVerification', { zoneId: v?.zoneId })).required };
}));
router.put('/vendor/eco-packaging', ...vendor, send(async (req) => va.saveEcoPackaging(vid(req), req.body || {})));

// ─── Gap AJ: delivery weekdays (VM-14) ───────────────────────────────────────────────────────────────────
router.get('/vendor/delivery-days', ...vendor, send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const v = await FoodRestaurant.findById(vid(req)).select('deliveryWeekdays zoneId').lean();
    return { deliveryWeekdays: v?.deliveryWeekdays?.length ? v.deliveryWeekdays : [1, 2, 3, 4, 5], weekendOpen: await getControl('weekendDelivery', { zoneId: v?.zoneId }) };
}));
router.put('/vendor/delivery-days', ...vendor, send(async (req) => va.saveDeliveryWeekdays(vid(req), req.body?.days)));

// ─── Gap AH: medical specialisms ─────────────────────────────────────────────────────────────────────────
router.get('/vendor/specialisms', ...vendor, send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const v = await FoodRestaurant.findById(vid(req)).select('specialisms').lean();
    return { open: await isEnabled('medicalSpecialisms'), specialisms: v?.specialisms || [], options: va.SPECIALISMS };
}));
router.post('/vendor/specialisms', ...vendor, send(async (req) => ({ specialisms: await va.applySpecialism(vid(req), req.body || {}) })));

// ─── Gap AE: menu coverage (VM-03) ───────────────────────────────────────────────────────────────────────
router.get('/vendor/menu-coverage', ...vendor, send(async (req) => va.menuCoverage(vid(req), { days: req.query.days })));

// ─── Gap P: returned pantry bags (shop partners) ─────────────────────────────────────────────────────────
router.get('/vendor/pantry-returns', ...vendor, send(async (req) => ({ returns: await pantryReturnsForVendor(vid(req), { status: req.query.status }) })));
router.patch('/vendor/pantry-returns/:deliveryId/restock', ...vendor, send(async (req) => ({ delivery: await markReturnRestocked(vid(req), req.params.deliveryId) })));

export default router;
