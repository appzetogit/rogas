import express from 'express';
import mongoose from 'mongoose';
import { requirePermission } from '../../../middleware/rbac.middleware.js';
import { FoodAdmin } from '../../../core/admin/admin.model.js';
import * as holidays from '../platform/holiday.service.js';
import { listZoneFees, setZoneFee, removeZoneFee } from '../platform/zoneFee.js';
import { expansionDemandReport } from '../zones/zoneGeo.service.js';
import { adminVendorReviews, moderateResponse } from '../ratings/ratings.service.js';
import { describeIntegration, saveIntegration } from '../integrations/integrations.js';
import * as customerAdmin from '../customer/customerAdmin.service.js';
import * as legal from '../legal/legal.service.js';
import * as va from '../vendor/vendorAmendment.service.js';
import * as settlements from '../vendor/settlement.service.js';
import { zoneIdsForCity, getControl } from '../platform/platformConfig.service.js';

/**
 * Admin endpoints for Amendment v2 Extra (mounted under /api/v1/food/admin/dmb).
 * Every write is audited via writeAudit (AP audit trail).
 */
const router = express.Router();

const send = (fn) => async (req, res) => {
    try {
        const data = await fn(req, res);
        if (!res.headersSent) res.json({ success: true, ...data });
    } catch (err) {
        res.status(err.statusCode || 400).json({ success: false, code: err.code, message: err.message, details: err.details });
    }
};

export const loadAdmin = async (req) => {
    const admin = await FoodAdmin.findById(req.user?.userId || req.user?._id).select('adminRole assignedCityIds email name').lean();
    if (!admin) throw Object.assign(new Error('Admin not found'), { statusCode: 401 });
    return admin;
};

/** Role gate on top of the permission matrix: SUPER_ADMIN always passes. */
export const requireAdminRoles = (...roles) => async (req, res, next) => {
    try {
        const admin = await loadAdmin(req);
        req.adminProfile = admin;
        if (admin.adminRole === 'SUPER_ADMIN' || roles.includes(admin.adminRole)) return next();
        return res.status(403).json({ success: false, message: `Only ${['SUPER_ADMIN', ...roles].join(', ')} can do this` });
    } catch (err) {
        return res.status(err.statusCode || 401).json({ success: false, message: err.message });
    }
};

export const audit = async (req, action, entityType, entityId, before, after, reason = '') => {
    try {
        const { writeAudit } = await import('../../food/admin/services/prdAdmin.service.js');
        await writeAudit(req, action, entityType, entityId, before, after, reason);
    } catch { /* best-effort */ }
};

// ─── Gap G: business holidays (AP-08) ────────────────────────────────────────────────────────────────────
router.get('/holidays', requirePermission('zoneCityManagement', 'view'), send(async (req) => ({
    holidays: await holidays.listHolidays({ year: req.query.year, status: req.query.status, cityId: req.query.cityId }),
    suggestedImportYear: new Date().getUTCFullYear() + (new Date().getUTCMonth() >= 9 ? 1 : 0)
})));
router.post('/holidays', requirePermission('zoneCityManagement', 'create'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const holiday = await holidays.createHoliday(req.body || {}, req.adminProfile);
    await audit(req, 'holiday.create', 'PlatformHoliday', holiday._id, null, holiday);
    return { holiday };
}));
router.post('/holidays/import-polish', requirePermission('zoneCityManagement', 'create'), requireAdminRoles(), send(async (req) => {
    const result = await holidays.importPolishHolidays(req.body?.year);
    await audit(req, 'holiday.import_polish', 'PlatformHoliday', String(req.body?.year), null, result);
    return result;
}));
router.post('/holidays/:id/confirm', requirePermission('zoneCityManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const holiday = await holidays.confirmHoliday(req.params.id, req.adminProfile);
    await audit(req, 'holiday.confirm', 'PlatformHoliday', req.params.id, null, { date: holiday.date, affected: holiday.affectedSubscriptions });
    return { holiday };
}));
router.post('/holidays/:id/reject', requirePermission('zoneCityManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const holiday = await holidays.rejectHoliday(req.params.id);
    await audit(req, 'holiday.reject', 'PlatformHoliday', req.params.id, null, null, req.body?.reason || '');
    return { holiday };
}));
router.delete('/holidays/:id', requirePermission('zoneCityManagement', 'delete'), requireAdminRoles(), send(async (req) => {
    const out = await holidays.deleteHoliday(req.params.id);
    await audit(req, 'holiday.delete', 'PlatformHoliday', req.params.id, null, null, req.body?.reason || '');
    return out;
}));

// ─── Gap K: zone delivery pricing (AP-08) ────────────────────────────────────────────────────────────────
router.get('/zone-fees', requirePermission('zoneCityManagement', 'view'), send(async () => listZoneFees()));
router.put('/zone-fees/:zoneId', requirePermission('zoneCityManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const fee = await setZoneFee({ zoneId: req.params.zoneId, ...req.body }, req.adminProfile._id);
    await audit(req, 'zone_fee.set', 'FoodZone', req.params.zoneId, null, fee);
    return { fee };
}));
router.delete('/zone-fees/:zoneId', requirePermission('zoneCityManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    await audit(req, 'zone_fee.remove', 'FoodZone', req.params.zoneId, null, null);
    return removeZoneFee(req.params.zoneId);
}));

// ─── Gap U: addresses attempted outside zones (AP-11 expansion demand) ───────────────────────────────────
router.get('/reports/expansion-demand', requirePermission('reports', 'view'), send(async (req) => expansionDemandReport({ days: req.query.days, gridKm: req.query.gridKm })));

// ─── Gap T: review moderation & response rate (AP-05) ────────────────────────────────────────────────────
router.get('/vendors/:id/reviews', requirePermission('vendorManagement', 'view'), send(async (req) => adminVendorReviews(req.params.id, { page: req.query.page, limit: req.query.limit })));
router.post('/reviews/:orderId/moderate', requirePermission('vendorManagement', 'edit'), requireAdminRoles('CITY_MANAGER', 'CUSTOMER_SERVICE'), send(async (req) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.orderId)) throw new Error('Invalid review');
    const { before, after } = await moderateResponse({ orderId: req.params.orderId, action: req.body?.action, reason: req.body?.reason, adminId: req.adminProfile._id });
    await audit(req, `review_response.${req.body?.action}`, 'DMBDailyOrder', req.params.orderId, before, after, req.body?.reason || '');
    return { response: after };
}));

// ─── Gaps H, I, J: integrations (AP-09) ──────────────────────────────────────────────────────────────────
router.get('/integrations', requirePermission('systemSettings', 'view'), send(async () => ({
    integrations: [await describeIntegration('whatsapp'), await describeIntegration('mailchimp')],
    googleAnalytics: await getControl('googleAnalytics'),
    mailchimp: await (await import('../integrations/mailchimp.service.js')).mailchimpStatus()
})));
router.put('/integrations/whatsapp', requirePermission('systemSettings', 'edit'), requireAdminRoles(), send(async (req) => {
    const out = await saveIntegration('whatsapp', req.body || {}, req.adminProfile._id);
    await audit(req, 'integration.update', 'Integration', 'whatsapp', null, { fields: Object.keys(req.body || {}) });
    return { integration: out };
}));
router.put('/integrations/mailchimp', requirePermission('systemSettings', 'edit'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => {
    const out = await saveIntegration('mailchimp', req.body || {}, req.adminProfile._id);
    await audit(req, 'integration.update', 'Integration', 'mailchimp', null, { fields: Object.keys(req.body || {}) });
    return { integration: out };
}));
router.post('/integrations/mailchimp/test', requirePermission('systemSettings', 'view'), requireAdminRoles('MARKETING_MANAGER'), send(async () => ({ result: await (await import('../integrations/mailchimp.service.js')).testMailchimp() })));
router.post('/integrations/mailchimp/sync', requirePermission('systemSettings', 'edit'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => {
    const result = await (await import('../integrations/mailchimp.service.js')).runMailchimpSync({ force: true });
    await audit(req, 'mailchimp.sync_now', 'Integration', 'mailchimp', null, result);
    return { result };
}));
router.post('/integrations/whatsapp/test', requirePermission('systemSettings', 'edit'), requireAdminRoles(), send(async (req) => {
    const { sendWhatsAppDocument } = await import('../integrations/whatsapp.service.js');
    const url = String(req.body?.documentUrl || '').trim() || 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
    return { result: await sendWhatsAppDocument({ to: req.body?.to, caption: 'DailyMealBox test message', documentUrl: url, filename: 'test.pdf', variables: { invoiceNumber: 'TEST' } }) };
}));
router.get('/integrations/whatsapp/logs', requirePermission('systemSettings', 'view'), send(async (req) => ({ logs: await (await import('../integrations/whatsapp.service.js')).recentWhatsAppLogs(req.query.limit) })));

// ─── Gap F: bad-debt customers (AP-11) ───────────────────────────────────────────────────────────────────
router.get('/bad-debt', requirePermission('customerManagement', 'view'), send(async (req) => {
    const admin = await loadAdmin(req);
    const cityId = admin.adminRole === 'CITY_MANAGER' ? (req.query.cityId && (admin.assignedCityIds || []).map(String).includes(String(req.query.cityId)) ? req.query.cityId : admin.assignedCityIds?.[0]) : req.query.cityId;
    return customerAdmin.badDebtReport({ cityId, page: req.query.page, limit: req.query.limit });
}));
router.post('/bad-debt/run', requirePermission('customerManagement', 'edit'), requireAdminRoles('CUSTOMER_SERVICE'), send(async () => ({ result: await customerAdmin.runBadDebtCheck() })));
router.post('/bad-debt/:userId/action', requirePermission('customerManagement', 'edit'), requireAdminRoles('CUSTOMER_SERVICE', 'CITY_MANAGER'), send(async (req) => {
    const badDebt = await customerAdmin.badDebtAction(req.params.userId, req.body || {}, req.adminProfile);
    await audit(req, `bad_debt.${req.body?.action}`, 'FoodUser', req.params.userId, null, { action: req.body?.action, amount: req.body?.amount, reference: req.body?.reference }, req.body?.note || '');
    return { badDebt };
}));

// ─── Gap Y: customer segments ────────────────────────────────────────────────────────────────────────────
router.get('/segments', requirePermission('customerManagement', 'view'), send(async () => ({ segments: await customerAdmin.listSegments(), enabled: (await getControl('customerSegments')).enabled })));
router.post('/segments', requirePermission('customerManagement', 'create'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => {
    const segment = await customerAdmin.createSegment(req.body || {}, req.adminProfile._id);
    await audit(req, 'segment.create', 'CustomerSegment', segment._id, null, segment);
    return { segment };
}));
router.patch('/segments/:id', requirePermission('customerManagement', 'edit'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => ({ segment: await customerAdmin.updateSegment(req.params.id, req.body || {}) })));
router.delete('/segments/:id', requirePermission('customerManagement', 'delete'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => {
    await audit(req, 'segment.delete', 'CustomerSegment', req.params.id, null, null);
    return customerAdmin.deleteSegment(req.params.id);
}));
router.get('/segments/:id/members', requirePermission('customerManagement', 'view'), send(async (req) => customerAdmin.segmentMembers(req.params.id, req.query)));
router.post('/segments/:id/members', requirePermission('customerManagement', 'edit'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => {
    const result = await customerAdmin.setSegmentMembers(req.params.id, req.body || {});
    await audit(req, 'segment.members', 'CustomerSegment', req.params.id, null, result);
    return result;
}));
router.post('/segments/:id/push', requirePermission('customerManagement', 'edit'), requireAdminRoles('MARKETING_MANAGER'), send(async (req) => {
    const result = await customerAdmin.pushToSegment(req.params.id, req.body || {});
    await audit(req, 'segment.push', 'CustomerSegment', req.params.id, null, { title: req.body?.title, ...result });
    return result;
}));

// ─── Gap AC: legal documents (AP-13) ─────────────────────────────────────────────────────────────────────
router.get('/legal', requirePermission('otaContent', 'view'), send(async () => legal.listDocuments()));
router.get('/legal/:docType/history', requirePermission('otaContent', 'view'), send(async (req) => legal.history(req.params.docType)));
router.post('/legal/:docType/draft', requirePermission('otaContent', 'edit'), requireAdminRoles('WEB_MANAGER'), send(async (req) => {
    const document = await legal.saveDraft({ ...req.body, docType: req.params.docType }, req.adminProfile._id);
    await audit(req, 'legal.save_draft', 'LegalDocument', document._id, null, { docType: document.docType, version: document.version });
    return { document };
}));
router.post('/legal/documents/:id/publish', requirePermission('otaContent', 'edit'), requireAdminRoles('WEB_MANAGER'), send(async (req) => {
    const document = await legal.publish(req.params.id, req.adminProfile._id);
    await audit(req, 'legal.publish', 'LegalDocument', document._id, null, { docType: document.docType, version: document.version, requiresReacceptance: document.requiresReacceptance });
    return { document };
}));
router.delete('/legal/documents/:id', requirePermission('otaContent', 'edit'), requireAdminRoles('WEB_MANAGER'), send(async (req) => {
    await audit(req, 'legal.discard_draft', 'LegalDocument', req.params.id, null, null);
    return legal.discardDraft(req.params.id, req.adminProfile._id);
}));

// ─── Gap AA: home cooks (AP-05) ──────────────────────────────────────────────────────────────────────────
router.get('/home-cooks', requirePermission('vendorManagement', 'view'), send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const admin = await loadAdmin(req);
    const filter = { vendorType: 'home_cook' };
    if (req.query.track === '1' || req.query.track === '2') filter.cookTrack = Number(req.query.track);
    if (req.query.track === 'none') filter.cookTrack = null;
    if (admin.adminRole === 'CITY_MANAGER' && admin.assignedCityIds?.length) {
        const zones = (await Promise.all(admin.assignedCityIds.map((c) => zoneIdsForCity(c)))).flat();
        filter.zoneId = { $in: zones };
    }
    const cooks = await FoodRestaurant.find(filter).select('restaurantName ownerName ownerEmail ownerPhone status cookTrack track1JoinedAt kitchenPhotos kitchenPhotoReview sanepidDocUrl sanepidDeadline track1Paused trackUpgradeNotice companyNip kitchenPartnerId preferredFleetPartnerId deliveryPreference').sort({ restaurantName: 1 }).lean();
    const threshold = await getControl('track1Threshold');
    const legalDoc = await legal.currentPublished('cook_agreement_track1');
    const rows = [];
    for (const c of cooks) {
        const month = c.cookTrack === 1 ? await va.monthlyGross(c._id) : null;
        const agreement = legalDoc && c.cookTrack === 1 ? Boolean(await legal.DMBLegalAcceptance.exists({ userType: 'vendor', userId: c._id, docType: 'cook_agreement_track1', version: legalDoc.version })) : null;
        const today = new Date();
        rows.push({
            ...c,
            kitchenPhotos: undefined,
            kitchenPhotoCount: c.kitchenPhotos?.length || 0,
            kitchenPhotoUrls: (c.kitchenPhotos || []).map((p) => p.url),
            monthGross: month?.gross ?? null,
            thresholdPct: month ? Math.round((month.gross / (Number(threshold.legalLimit) || 3499.5)) * 1000) / 10 : null,
            documents: c.cookTrack === 1 ? {
                kitchenPhotos: c.kitchenPhotoReview?.status === 'approved' ? 'green' : (c.kitchenPhotos?.length ? 'amber' : 'red'),
                sanepid: c.sanepidDocUrl ? 'green' : (c.sanepidDeadline && today > new Date(c.sanepidDeadline) ? 'red' : 'amber'),
                cookAgreement: agreement === null ? null : agreement ? 'green' : 'red'
            } : null
        });
    }
    return { threshold, cooks: rows };
}));
router.post('/home-cooks/:id/kitchen-review', requirePermission('vendorManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const track = await va.reviewKitchenPhotos(req.params.id, { approve: Boolean(req.body?.approve), reason: req.body?.reason }, req.adminProfile._id);
    await audit(req, req.body?.approve ? 'home_cook.kitchen_approve' : 'home_cook.kitchen_reject', 'FoodRestaurant', req.params.id, null, null, req.body?.reason || '');
    return { track };
}));
router.post('/home-cooks/:id/upgrade-notice', requirePermission('vendorManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const notice = await va.sendTrackUpgradeNotice(req.params.id, req.adminProfile._id);
    await audit(req, 'home_cook.upgrade_notice', 'FoodRestaurant', req.params.id, null, notice);
    return { notice };
}));

// ─── Gap AB: settlement statements ───────────────────────────────────────────────────────────────────────
router.get('/settlements', requirePermission('financialManagement', 'view'), send(async (req) => {
    const filter = {};
    if (req.query.period) filter.period = String(req.query.period);
    if (req.query.entityType) filter.entityType = req.query.entityType;
    return { settlements: await settlements.DMBSettlement.find(filter).sort({ period: -1, entityName: 1 }).limit(500).lean(), enabled: (await getControl('settlementStatements')).enabled };
}));
router.post('/settlements/generate', requirePermission('financialManagement', 'edit'), requireAdminRoles('ACCOUNTANT'), send(async (req) => {
    const now = req.body?.period ? new Date(`${req.body.period}-15T12:00:00Z`) : new Date();
    if (req.body?.period) now.setUTCMonth(now.getUTCMonth() + 1);
    const result = await settlements.generateMonthlySettlements(now);
    await audit(req, 'settlements.generate', 'Settlement', result.period || '', null, result);
    return { result };
}));
router.get('/settlements/:id/pdf', requirePermission('financialManagement', 'view'), async (req, res) => {
    try {
        const s = await settlements.DMBSettlement.findById(req.params.id).lean();
        if (!s) return res.status(404).json({ success: false, message: 'Statement not found' });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${s.number.replace(/\//g, '-')}.pdf`);
        settlements.renderSettlementPdf(s).pipe(res);
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Gap AD: preferred delivery partner requests (AP-05 / AP-06) ─────────────────────────────────────────
router.get('/fleet-requests', requirePermission('fleetManagement', 'view'), send(async (req) => {
    const filter = req.query.status ? { status: req.query.status } : {};
    const requests = await va.DMBFleetRequest.find(filter).sort({ createdAt: -1 }).limit(300).populate('vendorId', 'restaurantName city').populate('fleetPartnerId', 'companyName status').lean();
    const { FleetPartner } = await import('../vendor/fleetPartner.model.js');
    const partners = await FleetPartner.find({}).select('companyName contactName status entityType city preferredForVendorIds').populate('preferredForVendorIds', 'restaurantName').lean();
    return { requests, partners };
}));
router.post('/fleet-requests/:id/approve', requirePermission('fleetManagement', 'edit'), requireAdminRoles('CITY_MANAGER', 'FLEET_MANAGER'), send(async (req) => {
    const request = await va.DMBFleetRequest.findById(req.params.id).lean();
    if (!request || request.status !== 'pending') throw Object.assign(new Error('Request not found or already decided'), { statusCode: 404 });
    const link = await va.linkPreferredPartner({ vendorId: request.vendorId, fleetPartnerId: req.body?.fleetPartnerId || request.fleetPartnerId, requestId: request._id }, req.adminProfile._id);
    await audit(req, 'fleet_preference.link', 'FoodRestaurant', request.vendorId, { fleetPartnerId: link.previous }, { fleetPartnerId: link.fleetPartnerId });
    return { link };
}));
router.post('/fleet-requests/:id/reject', requirePermission('fleetManagement', 'edit'), requireAdminRoles('CITY_MANAGER', 'FLEET_MANAGER'), send(async (req) => {
    const request = await va.rejectPartnerRequest(req.params.id, req.body?.reason, req.adminProfile._id);
    await audit(req, 'fleet_preference.reject', 'DMBFleetRequest', req.params.id, null, null, req.body?.reason || '');
    return { request };
}));
router.post('/vendors/:id/preferred-partner', requirePermission('fleetManagement', 'edit'), requireAdminRoles('CITY_MANAGER', 'FLEET_MANAGER'), send(async (req) => {
    const link = await va.linkPreferredPartner({ vendorId: req.params.id, fleetPartnerId: req.body?.fleetPartnerId }, req.adminProfile._id);
    await audit(req, 'fleet_preference.link', 'FoodRestaurant', req.params.id, { fleetPartnerId: link.previous }, { fleetPartnerId: link.fleetPartnerId });
    return { link };
}));
router.delete('/vendors/:id/preferred-partner', requirePermission('fleetManagement', 'edit'), requireAdminRoles('CITY_MANAGER', 'FLEET_MANAGER'), send(async (req) => {
    const out = await va.unlinkPreferredPartner(req.params.id);
    await audit(req, 'fleet_preference.unlink', 'FoodRestaurant', req.params.id, { fleetPartnerId: out.previous }, null, req.body?.reason || '');
    return out;
}));
router.patch('/fleet/partners/:id/entity-type', requirePermission('fleetManagement', 'edit'), requireAdminRoles('FLEET_MANAGER'), send(async (req) => {
    const { FleetPartner } = await import('../vendor/fleetPartner.model.js');
    const entityType = req.body?.entityType === 'individual_unregistered' ? 'individual_unregistered' : 'company';
    const partner = await FleetPartner.findByIdAndUpdate(req.params.id, { $set: { entityType } }, { new: true }).lean();
    await audit(req, 'fleet_partner.entity_type', 'FleetPartner', req.params.id, null, { entityType });
    return { partner };
}));

// ─── Gap AI: eco packaging verification ──────────────────────────────────────────────────────────────────
router.get('/eco-vendors', requirePermission('vendorManagement', 'view'), send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const filter = { 'ecoPackaging.enabled': true };
    if (req.query.status === 'unverified') filter['ecoPackaging.adminVerified'] = { $ne: true };
    if (req.query.status === 'verified') filter['ecoPackaging.adminVerified'] = true;
    return { vendors: await FoodRestaurant.find(filter).select('restaurantName city ecoPackaging').sort({ 'ecoPackaging.declaredAt': -1 }).lean(), verificationRequired: (await getControl('ecoBadgeVerification')).required };
}));
router.post('/vendors/:id/eco-verify', requirePermission('vendorManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const vendor = await va.verifyEcoPackaging(req.params.id, Boolean(req.body?.verified), req.adminProfile._id);
    await audit(req, req.body?.verified ? 'eco.verify' : 'eco.unverify', 'FoodRestaurant', req.params.id, null, vendor.ecoPackaging);
    return { ecoPackaging: vendor.ecoPackaging };
}));

// ─── Gap AH: medical specialism reviews ──────────────────────────────────────────────────────────────────
router.get('/specialisms', requirePermission('vendorManagement', 'view'), send(async (req) => {
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const status = req.query.status || 'pending';
    const vendors = await FoodRestaurant.find({ 'specialisms.status': status }).select('restaurantName city specialisms').lean();
    return { applications: vendors.flatMap((v) => (v.specialisms || []).filter((s) => s.status === status).map((s) => ({ vendorId: v._id, vendorName: v.restaurantName, city: v.city, ...s }))) };
}));
router.post('/vendors/:vendorId/specialisms/:id/review', requirePermission('vendorManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const specialisms = await va.reviewSpecialism(req.params.vendorId, req.params.id, req.body || {}, req.adminProfile._id);
    await audit(req, req.body?.approve ? 'specialism.approve' : 'specialism.reject', 'FoodRestaurant', req.params.vendorId, null, { specialismId: req.params.id }, req.body?.reason || '');
    return { specialisms };
}));

// ─── Gap AL: temperature coverage + vendor reminder ──────────────────────────────────────────────────────
router.get('/meals/temperature-coverage', requirePermission('vendorManagement', 'view'), send(async () => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const [hot, cold, missing, vendorsMissing] = await Promise.all([
        DMBMealPlan.countDocuments({ status: 'active', temperatureType: 'hot' }),
        DMBMealPlan.countDocuments({ status: 'active', temperatureType: 'cold' }),
        DMBMealPlan.countDocuments({ status: 'active', temperatureType: null }),
        DMBMealPlan.distinct('vendorId', { status: 'active', temperatureType: null })
    ]);
    return { hot, cold, missing, vendorsMissing: vendorsMissing.length };
}));
router.post('/meals/temperature-reminder', requirePermission('vendorManagement', 'edit'), requireAdminRoles('CITY_MANAGER'), send(async (req) => {
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const { notifyMany } = await import('../notifications/notify.js');
    const { msg } = await import('../../i18n/i18n.service.js');
    const vendorIds = await DMBMealPlan.distinct('vendorId', { status: { $in: ['active', 'draft'] }, temperatureType: null });
    const res = await notifyMany(vendorIds.map((id) => ({ id })), {
        to: 'vendor', event: 'temperature_reminder',
        title: msg('Please mark your meals Hot or Cold'),
        body: msg('Customers now see 🔥 Hot and ❄ Cold labels. Open Menu Management and set how each meal is served.'),
        email: { subjectKey: 'Please update your meal listings with temperature type', bodyKey: 'Customers now see whether a meal arrives hot and ready to eat or as a cold meal box to reheat. Open Menu Management in the vendor app and choose Hot or Cold for each of your meals (cold meals also need short reheating instructions).' }
    });
    await audit(req, 'meals.temperature_reminder', 'DMBMealPlan', '', null, { vendors: vendorIds.length });
    return { vendors: vendorIds.length, delivered: res.sent };
}));

// ─── Gap E: today's stock status (AP-11) ─────────────────────────────────────────────────────────────────
router.get('/stock', requirePermission('reports', 'view'), send(async (req) => {
    const { stockStatusReport } = await import('../orders/stock.service.js');
    return stockStatusReport({ date: req.query.date, zoneIds: req.query.cityId ? await zoneIdsForCity(req.query.cityId) : undefined });
}));

// ─── Gap P: pantry return report (AP-11), CSV with ?format=csv ───────────────────────────────────────────
router.get('/reports/pantry-returns', requirePermission('reports', 'view'), async (req, res) => {
    try {
        const { pantryReturnReport, toCsv } = await import('../orders/pantryReturns.service.js');
        const report = await pantryReturnReport({ days: req.query.days, vendorId: req.query.vendorId });
        if (req.query.format === 'csv') {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=pantry-returns-${report.since}.csv`);
            return res.send(toCsv(report.items, [{ key: 'itemName', label: 'item_name' }, { key: 'shop', label: 'shop' }, { key: 'delivered', label: 'delivered' }, { key: 'returned', label: 'return_count' }, { key: 'returnRate', label: 'return_rate_pct' }]));
        }
        res.json({ success: true, ...report });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
});

// ─── Gap AG / AK: Select-mode conversions and Smart Rotation metrics (AP-11) ─────────────────────────────
router.get('/reports/growth', requirePermission('reports', 'view'), send(async (req) => {
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const days = Math.max(1, Math.min(Number(req.query.days) || 30, 365));
    const since = new Date(Date.now() - days * 86_400_000);
    const [selectOrders, selectDelivered, converted, rotationActive, familyActive, trialsActive, annualActive] = await Promise.all([
        DMBDailyOrder.countDocuments({ orderType: 'one_time_select', createdAt: { $gte: since } }),
        DMBDailyOrder.countDocuments({ orderType: 'one_time_select', status: 'delivered', createdAt: { $gte: since } }),
        DMBDailyOrder.countDocuments({ orderType: 'one_time_select', convertedToSubscriptionId: { $ne: null }, createdAt: { $gte: since } }),
        DMBSubscription.countDocuments({ status: { $in: ['active', 'paused'] }, subscriptionType: 'rotation' }),
        DMBSubscription.countDocuments({ status: { $in: ['active', 'paused'] }, 'familyBox.enabled': true }),
        DMBSubscription.countDocuments({ status: { $in: ['active', 'paused'] }, isTrial: true }),
        DMBSubscription.countDocuments({ status: { $in: ['active', 'paused'] }, billingCycle: 'annual' })
    ]);
    const perVendor = await DMBSubscription.aggregate([
        { $match: { status: { $in: ['active', 'paused'] } } },
        { $unwind: { path: '$vendorIds', preserveNullAndEmptyArrays: false } },
        { $group: { _id: '$vendorIds', dedicated: { $sum: { $cond: [{ $eq: ['$subscriptionType', 'rotation'] }, 0, 1] } }, rotation: { $sum: { $cond: [{ $eq: ['$subscriptionType', 'rotation'] }, 1, 0] } } } },
        { $sort: { rotation: -1, dedicated: -1 } },
        { $limit: 200 }
    ]);
    const { FoodRestaurant } = await import('../../food/restaurant/models/restaurant.model.js');
    const names = new Map((await FoodRestaurant.find({ _id: { $in: perVendor.map((p) => p._id) } }).select('restaurantName city').lean()).map((v) => [String(v._id), v]));
    return {
        days,
        select: { orders: selectOrders, delivered: selectDelivered, converted, conversionRate: selectDelivered ? Math.round((converted / selectDelivered) * 1000) / 10 : 0 },
        subscriptions: { rotationActive, familyActive, trialsActive, annualActive },
        vendors: perVendor.map((p) => ({ vendorId: p._id, name: names.get(String(p._id))?.restaurantName || '', city: names.get(String(p._id))?.city || '', dedicated: p.dedicated, rotation: p.rotation, total: p.dedicated + p.rotation }))
    };
}));

// ─── Gap N: security & encryption status (AP-09) ─────────────────────────────────────────────────────────
router.get('/security/status', requirePermission('systemSettings', 'view'), send(async () => {
    const { securityStatus } = await import('../platform/security.js');
    return securityStatus();
}));

export default router;
