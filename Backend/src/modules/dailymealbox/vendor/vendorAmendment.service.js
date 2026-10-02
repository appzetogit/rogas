import mongoose from 'mongoose';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { getControl, isEnabled, raiseAdminAlert } from '../platform/platformConfig.service.js';
import { notify } from '../notifications/notify.js';
import { msg } from '../../i18n/i18n.service.js';
import { addDays, localToday, localDateStr, storageDateStr, dateOnlyFromStr } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

/**
 * Vendor-side features of Amendment v2 Extra:
 *   AA  two-track home cook onboarding (track choice, kitchen photos, Sanepid document, earnings vs. the limit)
 *   AD  preferred delivery partner requests
 *   AI  eco-packaging declaration
 *   AJ  weekend delivery days
 *   AH  medical diet specialisms
 *   AE  menu coverage for the 10-day customer calendar
 */

export class VendorError extends Error {
    constructor(message, statusCode = 400, code = 'INVALID', details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
    }
}

const getVendor = async (vendorId, select) => {
    const v = await FoodRestaurant.findById(vendorId).select(select).lean();
    if (!v) throw new VendorError('Vendor not found', 404);
    return v;
};

// ─── Gap AA: two-track home cook ─────────────────────────────────────────────────────────────────────────

/** Gross (food value of delivered orders) a vendor earned in a calendar month — the figure compared with the limit. */
export const monthlyGross = async (vendorId, { year, month, until } = {}) => {
    const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
    const today = localToday();
    const y = year ?? today.getUTCFullYear();
    const m = month ?? today.getUTCMonth();
    const from = new Date(Date.UTC(y, m, 1));
    let to = new Date(Date.UTC(y, m + 1, 1));
    if (until && until < to) to = until;
    const [row] = await DMBDailyOrder.aggregate([
        { $match: { vendorId: new mongoose.Types.ObjectId(String(vendorId)), status: 'delivered', deliveryDate: { $gte: from, $lt: to } } },
        { $group: { _id: null, gross: { $sum: '$pricing.foodCost' }, orders: { $sum: 1 } } }
    ]);
    return { gross: Math.round((row?.gross || 0) * 100) / 100, orders: row?.orders || 0, from, to };
};

export const trackOverview = async (vendorId) => {
    const v = await getVendor(vendorId, 'vendorType cookTrack track1JoinedAt kitchenPhotos kitchenPhotoReview sanepidDocUrl sanepidUploadedAt sanepidDeadline track1Paused companyNip kitchenPartnerId trackUpgradeNotice zoneId');
    const [threshold, gmp, track1Enabled, photoReview] = await Promise.all([
        getControl('track1Threshold'), getControl('gmpTemplate'), isEnabled('homeCookTrack1', { zoneId: v.zoneId }), getControl('kitchenPhotoReview')
    ]);
    const month = await monthlyGross(vendorId);
    const limit = Number(threshold.legalLimit) || 3499.5;
    const pct = limit ? Math.round((month.gross / limit) * 1000) / 10 : 0;
    const today = localToday();
    const docState = (uploaded, deadline) => (uploaded ? 'green' : deadline && today > new Date(deadline) ? 'red' : 'amber');
    let cookAgreement = null;
    try {
        const legal = await import('../legal/legal.service.js');
        const current = await legal.currentPublished('cook_agreement_track1');
        if (current) {
            const accepted = await legal.DMBLegalAcceptance.exists({ userType: 'vendor', userId: vendorId, docType: 'cook_agreement_track1', version: current.version });
            cookAgreement = { version: current.version, accepted: Boolean(accepted) };
        }
    } catch { /* legal module optional */ }
    return {
        isHomeCook: v.vendorType === 'home_cook',
        track1Available: track1Enabled,
        cookTrack: v.cookTrack || null,
        track1JoinedAt: v.track1JoinedAt,
        paused: Boolean(v.track1Paused),
        upgradeNotice: v.trackUpgradeNotice?.sentAt ? v.trackUpgradeNotice : null,
        earnings: { month: localDateStr().slice(0, 7), gross: month.gross, orders: month.orders, limit, warningPct: Number(threshold.warningPct) || 80, progressPct: pct, level: pct >= 100 ? 'red' : pct >= (Number(threshold.warningPct) || 80) ? 'amber' : 'green' },
        documents: v.cookTrack === 1 ? [
            { key: 'kitchen_photos', label: 'Kitchen photos', count: v.kitchenPhotos?.length || 0, required: Number(photoReview.minPhotos) || 2, review: v.kitchenPhotoReview?.status || 'not_submitted', state: v.kitchenPhotoReview?.status === 'approved' ? 'green' : (v.kitchenPhotos?.length ? 'amber' : 'red') },
            { key: 'sanepid', label: 'Sanepid registration', uploaded: Boolean(v.sanepidDocUrl), url: v.sanepidDocUrl || '', deadline: v.sanepidDeadline, state: docState(v.sanepidDocUrl, v.sanepidDeadline) }
        ] : [],
        guidance: { gmpTemplateUrl: gmp.templateUrl || '', sanepidChecklistUrl: gmp.checklistUrl || '', version: gmp.version, language: gmp.language },
        cookAgreement
    };
};

/** VM-02 track selection. Track 1 needs ACM-161 for the vendor's city; Track 2 needs a company NIP or a Kitchen Partner. */
export const selectTrack = async (vendorId, { track, companyNip, kitchenPartnerId }) => {
    const v = await getVendor(vendorId, 'vendorType cookTrack zoneId ownerEmail track1JoinedAt');
    if (v.vendorType !== 'home_cook') throw new VendorError('Only home cooks choose a track');
    const t = Number(track);
    const update = {};
    if (t === 1) {
        if (!(await isEnabled('homeCookTrack1', { zoneId: v.zoneId }))) throw new VendorError('Track 1 is not available in your city — register with a company or a Kitchen Partner (Track 2)', 403, 'FEATURE_DISABLED');
        if (v.cookTrack === 2) throw new VendorError('A Track 2 vendor cannot move back to Track 1');
        const grace = Number((await getControl('sanepidGracePeriod', { zoneId: v.zoneId })).days) || 30;
        Object.assign(update, { cookTrack: 1, track1JoinedAt: v.track1JoinedAt || new Date(), sanepidDeadline: addDays(localToday(), grace), cookTrackChangedAt: new Date() });
    } else if (t === 2) {
        const nip = String(companyNip || '').replace(/[^\d]/g, '');
        if (!kitchenPartnerId && nip.length !== 10) throw new VendorError('Enter your company NIP (10 digits) or choose a Kitchen Partner');
        Object.assign(update, { cookTrack: 2, cookTrackChangedAt: new Date(), track1Paused: false });
        if (nip) update.companyNip = nip;
        if (kitchenPartnerId && mongoose.Types.ObjectId.isValid(String(kitchenPartnerId))) update.kitchenPartnerId = kitchenPartnerId;
    } else {
        throw new VendorError('Choose Track 1 or Track 2');
    }
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: update });
    if (t === 1 && v.ownerEmail) {
        const gmp = await getControl('gmpTemplate');
        const { queueEmail } = await import('../../email/email.service.js');
        await queueEmail({
            to: v.ownerEmail,
            subjectKey: 'Your GMP/GHP template and Sanepid checklist',
            bodyKey: 'Welcome to DailyMealBox as a Track 1 home cook. Download your GMP/GHP documentation template: {{templateUrl}}\nSanepid registration checklist: {{checklistUrl}}\nUpload your Sanepid registration in the app within {{days}} days.',
            vars: { templateUrl: gmp.templateUrl || '-', checklistUrl: gmp.checklistUrl || '-', days: Number((await getControl('sanepidGracePeriod', { zoneId: v.zoneId })).days) || 30 },
            ownerType: 'RESTAURANT', ownerId: vendorId,
            attachments: gmp.templateUrl ? [{ filename: 'GMP-GHP-template.pdf', path: gmp.templateUrl }] : []
        }).catch((err) => logger.warn(`[track1] template email failed: ${err.message}`));
    }
    return trackOverview(vendorId);
};

const urlOk = (u) => /^https?:\/\//i.test(String(u || ''));

export const saveKitchenPhotos = async (vendorId, urls) => {
    const list = (Array.isArray(urls) ? urls : []).filter(urlOk).slice(0, 10);
    const min = Number((await getControl('kitchenPhotoReview')).minPhotos) || 2;
    if (list.length < min) throw new VendorError(`Upload at least ${min} kitchen photos (front and main workspace)`);
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: { kitchenPhotos: list.map((url) => ({ url, uploadedAt: new Date() })), kitchenPhotoReview: { status: 'pending', reviewedBy: null, reviewedAt: null, reason: '' } } });
    return trackOverview(vendorId);
};

export const saveSanepidDocument = async (vendorId, url) => {
    if (!urlOk(url)) throw new VendorError('Upload the Sanepid registration document');
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: { sanepidDocUrl: url, sanepidUploadedAt: new Date(), track1Paused: false } });
    return trackOverview(vendorId);
};

/** Admin: approve/reject kitchen photos (ACM-165). */
export const reviewKitchenPhotos = async (vendorId, { approve, reason }, adminId) => {
    if (!approve && !String(reason || '').trim()) throw new VendorError('Give a reason for rejecting the photos');
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: { kitchenPhotoReview: { status: approve ? 'approved' : 'rejected', reviewedBy: adminId, reviewedAt: new Date(), reason: approve ? '' : String(reason).trim() } } });
    await notify({
        to: 'vendor', id: vendorId, event: 'kitchen_review',
        title: approve ? msg('Kitchen photos approved') : msg('Kitchen photos need another look'),
        body: approve ? msg('Your kitchen photos were approved.') : msg('Your kitchen photos were not approved: {{reason}}', { reason: String(reason).trim() })
    });
    return trackOverview(vendorId);
};

/** Approval guard: a Track 1 cook goes live only after the kitchen photo review (ACM-165). */
export const assertTrack1ReadyForApproval = async (vendorId) => {
    const v = await FoodRestaurant.findById(vendorId).select('vendorType cookTrack kitchenPhotoReview').lean();
    if (v?.vendorType !== 'home_cook' || v.cookTrack !== 1) return;
    const review = await getControl('kitchenPhotoReview');
    if (review.required && v.kitchenPhotoReview?.status !== 'approved') {
        throw new VendorError('Review and approve this Track 1 cook\'s kitchen photos before approving the vendor', 409, 'KITCHEN_REVIEW_REQUIRED');
    }
};

/** AP-05 "Send Track Upgrade Notice": push + email, 30-day grace. */
export const sendTrackUpgradeNotice = async (vendorId, adminId) => {
    const v = await getVendor(vendorId, 'cookTrack ownerEmail restaurantName');
    if (v.cookTrack !== 1) throw new VendorError('Only Track 1 cooks receive an upgrade notice');
    const deadline = addDays(localToday(), 30);
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: { trackUpgradeNotice: { sentAt: new Date(), deadline, sentBy: adminId } } });
    await notify({
        to: 'vendor', id: vendorId, event: 'track_upgrade',
        title: msg('Please upgrade to Track 2'),
        body: msg('Your earnings have exceeded the threshold. Please upgrade to Track 2 or register your business within 30 days.'),
        email: {
            subjectKey: 'Action needed: upgrade to Track 2 within 30 days',
            bodyKey: 'Your monthly earnings on DailyMealBox have exceeded the limit for unregistered activity (działalność nierejestrowana). Please upgrade to Track 2 — link to a Kitchen Partner or register your own business (CEIDG) — by {{deadline}}. After that date your account will be reviewed.',
            vars: { deadline: storageDateStr(deadline) }
        }
    });
    return { sentAt: new Date(), deadline };
};

/** Job (daily 07:00): Track 1 earnings vs the limit (ACM-162) → vendor warnings and AP-01 alerts. */
export const track1ThresholdCheck = async () => {
    const t = await getControl('track1Threshold');
    const limit = Number(t.legalLimit) || 3499.5;
    const warnAt = limit * (Number(t.warningPct) || 80) / 100;
    const adminAt = Number(t.adminAlertAmount) || 3000;
    const monthKey = localDateStr().slice(0, 7);
    const cooks = await FoodRestaurant.find({ cookTrack: 1, status: 'approved' }).select('restaurantName ownerName zoneId track1Warnings').lean();
    let warned = 0;
    for (const cook of cooks) {
        const { gross } = await monthlyGross(cook._id);
        const level = gross > limit ? 'red' : gross >= warnAt ? 'amber' : null;
        const sent = cook.track1Warnings?.[monthKey] || [];
        if (level && !sent.includes(level)) {
            await FoodRestaurant.updateOne({ _id: cook._id }, { $addToSet: { [`track1Warnings.${monthKey}`]: level } });
            await notify({
                to: 'vendor', id: cook._id, event: 'track1_threshold',
                title: level === 'red' ? msg('You have passed the unregistered activity limit') : msg('You are approaching the unregistered activity limit'),
                body: level === 'red'
                    ? msg('This month you earned {{gross}} PLN, above the {{limit}} PLN limit. Upgrade to Track 2 (Kitchen Partner or your own CEIDG registration).', { gross, limit })
                    : msg('This month you earned {{gross}} PLN of the {{limit}} PLN limit. Consider registering your business.', { gross, limit })
            });
            warned++;
        }
        if (gross >= adminAt) {
            await raiseAdminAlert({
                type: 'track1_threshold', severity: gross > limit ? 'critical' : 'warning',
                title: `Track 1 cook ${cook.ownerName || cook.restaurantName} earning ${gross} PLN this month`,
                message: `Approaching or above the ${limit} PLN unregistered activity limit.`,
                entityType: 'FoodRestaurant', entityId: cook._id, link: '/admin/food/dmb/home-cooks', dedupeKey: `track1:${cook._id}:${monthKey}:${gross > limit ? 'over' : 'near'}`
            });
        }
    }
    return { cooks: cooks.length, warned };
};

/** Job (daily 08:00): Sanepid grace period (ACM-163) — reminders 7 and 1 day(s) before, pause when overdue. */
export const sanepidGraceCheck = async () => {
    const today = localToday();
    const cooks = await FoodRestaurant.find({ cookTrack: 1, sanepidDocUrl: { $in: ['', null] }, sanepidDeadline: { $ne: null } }).select('restaurantName sanepidDeadline track1Paused ownerEmail').lean();
    let paused = 0;
    for (const cook of cooks) {
        const days = Math.round((new Date(cook.sanepidDeadline).getTime() - today.getTime()) / 86_400_000);
        if (days < 0 && !cook.track1Paused) {
            await FoodRestaurant.updateOne({ _id: cook._id }, { $set: { track1Paused: true, isAcceptingOrders: false } });
            paused++;
            await notify({ to: 'vendor', id: cook._id, event: 'sanepid_overdue', title: msg('Account paused'), body: msg('Your account is paused until your Sanepid registration document is uploaded.') });
            await raiseAdminAlert({ type: 'sanepid_overdue', severity: 'warning', title: `Sanepid document overdue: ${cook.restaurantName}`, message: 'Track 1 cook paused until the document is uploaded.', entityType: 'FoodRestaurant', entityId: cook._id, link: '/admin/food/dmb/home-cooks', dedupeKey: `sanepid:${cook._id}` });
        } else if (days === 7 || days === 1) {
            await notify({ to: 'vendor', id: cook._id, event: 'sanepid_reminder', title: msg('Upload your Sanepid registration'), body: msg('Upload your Sanepid registration within {{days}} day(s) to keep receiving orders.', { days }) });
        }
    }
    return { checked: cooks.length, paused };
};

// ─── Gap AD: preferred delivery partner ──────────────────────────────────────────────────────────────────

const requestSchema = new mongoose.Schema(
    {
        vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', required: true, index: true },
        fleetPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FleetPartner', default: null },
        partnerName: { type: String, required: true, trim: true },
        contactName: { type: String, default: '', trim: true },
        contactPhone: { type: String, default: '', trim: true },
        contactEmail: { type: String, default: '', trim: true },
        entityType: { type: String, enum: ['company', 'individual_unregistered'], default: 'company' },
        note: { type: String, default: '', trim: true },
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'withdrawn'], default: 'pending', index: true },
        rejectionReason: { type: String, default: '' },
        decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        decidedAt: { type: Date, default: null }
    },
    { collection: 'dmb_fleet_requests', timestamps: true }
);
export const DMBFleetRequest = mongoose.models.DMBFleetRequest || mongoose.model('DMBFleetRequest', requestSchema);

export const deliveryPartnerStatus = async (vendorId) => {
    const v = await getVendor(vendorId, 'deliveryPreference preferredFleetPartnerId');
    const enabled = await isEnabled('preferredFleetRequests');
    const { FleetPartner } = await import('./fleetPartner.model.js');
    const partner = v.preferredFleetPartnerId ? await FleetPartner.findById(v.preferredFleetPartnerId).select('companyName contactName status').lean() : null;
    const request = await DMBFleetRequest.findOne({ vendorId }).sort({ createdAt: -1 }).lean();
    return { enabled, preference: v.deliveryPreference || 'pool', partner, request };
};

export const requestPreferredPartner = async (vendorId, body) => {
    if (!(await isEnabled('preferredFleetRequests'))) throw new VendorError('Choosing your own delivery partner is not available', 403, 'FEATURE_DISABLED');
    if (!String(body?.partnerName || '').trim()) throw new VendorError('Enter your delivery partner\'s name or company');
    if (await DMBFleetRequest.exists({ vendorId, status: 'pending' })) throw new VendorError('You already have a request waiting for approval', 409);
    const doc = await DMBFleetRequest.create({
        vendorId,
        fleetPartnerId: mongoose.Types.ObjectId.isValid(String(body.fleetPartnerId || '')) ? body.fleetPartnerId : null,
        partnerName: String(body.partnerName).trim().slice(0, 120),
        contactName: String(body.contactName || '').slice(0, 120),
        contactPhone: String(body.contactPhone || '').slice(0, 30),
        contactEmail: String(body.contactEmail || '').slice(0, 120),
        entityType: body.entityType === 'individual_unregistered' ? 'individual_unregistered' : 'company',
        note: String(body.note || '').slice(0, 500)
    });
    await raiseAdminAlert({ type: 'fleet_request', severity: 'info', title: 'New preferred delivery partner request', message: `${doc.partnerName} requested by a vendor`, entityType: 'DMBFleetRequest', entityId: doc._id, link: '/admin/food/dmb/fleet-requests' });
    return doc.toObject();
};

export const withdrawPartnerRequest = async (vendorId) => {
    await DMBFleetRequest.updateMany({ vendorId, status: 'pending' }, { $set: { status: 'withdrawn' } });
    return deliveryPartnerStatus(vendorId);
};

/** Admin: link an approved fleet partner as preferred for a vendor (one partner per vendor, many vendors per partner). */
export const linkPreferredPartner = async ({ vendorId, fleetPartnerId, requestId }, adminId) => {
    const { FleetPartner } = await import('./fleetPartner.model.js');
    const partner = await FleetPartner.findById(fleetPartnerId);
    if (!partner) throw new VendorError('Fleet partner not found', 404);
    if (partner.status !== 'active') throw new VendorError('The fleet partner must be verified and active before it can be linked');
    const vendor = await FoodRestaurant.findById(vendorId).select('preferredFleetPartnerId restaurantName');
    if (!vendor) throw new VendorError('Vendor not found', 404);
    const previous = vendor.preferredFleetPartnerId;
    if (previous && String(previous) !== String(fleetPartnerId)) await FleetPartner.updateOne({ _id: previous }, { $pull: { preferredForVendorIds: vendor._id } });
    vendor.preferredFleetPartnerId = partner._id;
    vendor.deliveryPreference = 'preferred_fleet_partner';
    await vendor.save();
    await FleetPartner.updateOne({ _id: partner._id }, { $addToSet: { preferredForVendorIds: vendor._id } });
    if (requestId) await DMBFleetRequest.updateOne({ _id: requestId }, { $set: { status: 'approved', fleetPartnerId: partner._id, decidedBy: adminId, decidedAt: new Date() } });
    await notify({ to: 'vendor', id: vendorId, event: 'fleet_request', title: msg('Delivery partner approved'), body: msg('{{partner}} is now your preferred delivery partner.', { partner: partner.companyName }) });
    return { vendorId, previous, fleetPartnerId: partner._id };
};

export const rejectPartnerRequest = async (requestId, reason, adminId) => {
    if (!String(reason || '').trim()) throw new VendorError('A reason is required');
    const req = await DMBFleetRequest.findOneAndUpdate({ _id: requestId, status: 'pending' }, { $set: { status: 'rejected', rejectionReason: String(reason).trim(), decidedBy: adminId, decidedAt: new Date() } }, { new: true }).lean();
    if (!req) throw new VendorError('Request not found or already decided', 404);
    await notify({ to: 'vendor', id: req.vendorId, event: 'fleet_request', title: msg('Delivery partner request not approved'), body: msg('Reason: {{reason}}. You can send a new request.', { reason: req.rejectionReason }) });
    return req;
};

export const unlinkPreferredPartner = async (vendorId) => {
    const { FleetPartner } = await import('./fleetPartner.model.js');
    const vendor = await FoodRestaurant.findById(vendorId).select('preferredFleetPartnerId');
    if (!vendor) throw new VendorError('Vendor not found', 404);
    const previous = vendor.preferredFleetPartnerId;
    if (previous) await FleetPartner.updateOne({ _id: previous }, { $pull: { preferredForVendorIds: vendor._id } });
    vendor.preferredFleetPartnerId = null;
    vendor.deliveryPreference = 'pool';
    await vendor.save();
    await notify({ to: 'vendor', id: vendorId, event: 'fleet_request', title: msg('Back to the platform driver pool'), body: msg('Your orders are now collected by the platform driver pool.') });
    return { vendorId, previous };
};

/**
 * Routing priority (ACM-170): among the drivers that could take a vendor's pickup, the vendor's preferred partner's
 * drivers go first; when none of them is available the whole pool is used. Silent fallback.
 */
export const prioritisePreferredDrivers = async (vendor, drivers) => {
    try {
        if (!vendor?.preferredFleetPartnerId || !drivers?.length) return { drivers, preferred: false };
        if (!(await isEnabled('preferredFleetRouting', { zoneId: vendor.zoneId }))) return { drivers, preferred: false };
        const own = drivers.filter((d) => String(d.fleetPartnerId || '') === String(vendor.preferredFleetPartnerId));
        return own.length ? { drivers: own, preferred: true } : { drivers, preferred: false };
    } catch {
        return { drivers, preferred: false };
    }
};

// ─── Gap AI: eco packaging ───────────────────────────────────────────────────────────────────────────────

const ECO_TYPES = ['biodegradable', 'recyclable', 'paper', 'reusable'];

export const ecoBadgeVisible = async (vendor) => {
    if (!vendor?.ecoPackaging?.enabled) return false;
    if (vendor.ecoPackaging.adminVerified) return true;
    return !(await getControl('ecoBadgeVerification', { zoneId: vendor.zoneId })).required;
};

export const saveEcoPackaging = async (vendorId, { enabled, type, photoUrl }) => {
    const on = Boolean(enabled);
    if (on && !ECO_TYPES.includes(type)) throw new VendorError('Choose the type of eco packaging');
    const v = await getVendor(vendorId, 'ecoPackaging');
    const changed = on !== Boolean(v.ecoPackaging?.enabled) || type !== v.ecoPackaging?.type || (photoUrl || '') !== (v.ecoPackaging?.photoUrl || '');
    await FoodRestaurant.updateOne({ _id: vendorId }, {
        $set: {
            ecoPackaging: {
                enabled: on, type: on ? type : '', photoUrl: urlOk(photoUrl) ? photoUrl : '',
                declaredAt: on ? new Date() : null,
                // Any change to the declaration needs a fresh verification.
                adminVerified: changed ? false : Boolean(v.ecoPackaging?.adminVerified),
                verifiedBy: changed ? null : v.ecoPackaging?.verifiedBy || null,
                verifiedAt: changed ? null : v.ecoPackaging?.verifiedAt || null
            }
        }
    });
    const fresh = await getVendor(vendorId, 'ecoPackaging zoneId');
    return { ecoPackaging: fresh.ecoPackaging, badgeVisible: await ecoBadgeVisible(fresh), verificationRequired: (await getControl('ecoBadgeVerification', { zoneId: fresh.zoneId })).required };
};

export const verifyEcoPackaging = async (vendorId, verified, adminId) => {
    const v = await getVendor(vendorId, 'ecoPackaging');
    if (!v.ecoPackaging?.enabled) throw new VendorError('This vendor has not declared eco packaging');
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: { 'ecoPackaging.adminVerified': Boolean(verified), 'ecoPackaging.verifiedBy': adminId, 'ecoPackaging.verifiedAt': new Date() } });
    return getVendor(vendorId, 'ecoPackaging');
};

// ─── Gap AJ: delivery weekdays ───────────────────────────────────────────────────────────────────────────

export const saveDeliveryWeekdays = async (vendorId, days) => {
    const v = await getVendor(vendorId, 'zoneId');
    const list = [...new Set((Array.isArray(days) ? days : []).map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
    if (!list.length) throw new VendorError('Choose at least one delivery day');
    const weekend = await getControl('weekendDelivery', { zoneId: v.zoneId });
    if (list.includes(6) && !weekend.saturday) throw new VendorError('Saturday delivery is not open in your city yet', 403, 'WEEKEND_CLOSED');
    if (list.includes(0) && !weekend.sunday) throw new VendorError('Sunday delivery is not open in your city yet', 403, 'WEEKEND_CLOSED');
    await FoodRestaurant.updateOne({ _id: vendorId }, { $set: { deliveryWeekdays: list } });
    return { deliveryWeekdays: list, weekendOpen: weekend };
};

// ─── Gap AH: medical specialisms ─────────────────────────────────────────────────────────────────────────

export const SPECIALISMS = ['hashimoto', 'pregnancy', 'low_gi', 'menopause'];

export const applySpecialism = async (vendorId, { specialism, documentUrl, samplePlanUrl, dietitianName, notes }) => {
    if (!(await isEnabled('medicalSpecialisms'))) throw new VendorError('Specialism applications are closed', 403, 'FEATURE_DISABLED');
    if (!SPECIALISMS.includes(specialism)) throw new VendorError('Unknown specialism');
    if (!urlOk(documentUrl)) throw new VendorError('Upload the certified dietitian collaboration document');
    const v = await FoodRestaurant.findById(vendorId).select('specialisms');
    const existing = (v.specialisms || []).find((s) => s.specialism === specialism);
    if (existing && ['pending', 'approved'].includes(existing.status) && !(existing.status === 'approved' && existing.expiryDate && new Date(existing.expiryDate) < addDays(localToday(), 60))) {
        throw new VendorError(existing.status === 'pending' ? 'This application is already under review' : 'You already hold this specialism', 409);
    }
    const entry = { specialism, status: 'pending', documentUrl, samplePlanUrl: urlOk(samplePlanUrl) ? samplePlanUrl : '', dietitianName: String(dietitianName || '').slice(0, 120), notes: String(notes || '').slice(0, 500), appliedAt: new Date() };
    v.specialisms = [...(v.specialisms || []).filter((s) => s.specialism !== specialism || s.status === 'approved'), entry];
    await v.save();
    await raiseAdminAlert({ type: 'specialism_application', severity: 'info', title: 'Medical specialism application', message: `${specialism} — review the dietitian credentials`, entityType: 'FoodRestaurant', entityId: vendorId, link: '/admin/food/dmb/specialisms' });
    return v.toObject().specialisms;
};

export const reviewSpecialism = async (vendorId, specialismId, { approve, reason, verificationLevel }, adminId) => {
    const v = await FoodRestaurant.findById(vendorId).select('specialisms');
    const s = v?.specialisms?.id(specialismId);
    if (!s) throw new VendorError('Application not found', 404);
    if (approve) {
        const months = Number((await getControl('dietitianBadgeValidity')).months) || 12;
        const expiry = new Date(localToday());
        expiry.setUTCMonth(expiry.getUTCMonth() + months);
        // A renewal replaces the previous approval of the same specialism.
        v.specialisms = v.specialisms.filter((x) => x.specialism !== s.specialism || String(x._id) === String(specialismId));
        const fresh = v.specialisms.id(specialismId);
        Object.assign(fresh, { status: 'approved', approvedBy: adminId, approvedAt: new Date(), expiryDate: expiry, rejectionReason: '', reminderSentAt: null, verificationLevel: verificationLevel === 'dailymealbox_verified' ? 'dailymealbox_verified' : 'dietitian_certified' });
    } else {
        if (!String(reason || '').trim()) throw new VendorError('A reason is required');
        Object.assign(s, { status: 'rejected', rejectionReason: String(reason).trim(), approvedBy: adminId });
    }
    await v.save();
    await notify({
        to: 'vendor', id: vendorId, event: 'specialism_review',
        title: approve ? msg('Specialism approved') : msg('Specialism application not approved'),
        body: approve ? msg('Your "Dietitian Certified" badge is now visible to customers.') : msg('Reason: {{reason}}', { reason: String(reason).trim() })
    });
    return v.toObject().specialisms;
};

/** Approved, unexpired specialisms (what customers see as "Dietitian Certified"). */
export const activeSpecialisms = (vendor) => (vendor?.specialisms || [])
    .filter((s) => s.status === 'approved' && (!s.expiryDate || new Date(s.expiryDate) >= localToday()))
    .map((s) => ({ specialism: s.specialism, verificationLevel: s.verificationLevel, expiryDate: s.expiryDate }));

/** Job (daily 09:00): renewal reminder 60 days before expiry, expire past ones (badge removed automatically). */
export const specialismExpiryCheck = async () => {
    const today = localToday();
    const vendors = await FoodRestaurant.find({ 'specialisms.status': 'approved' }).select('specialisms restaurantName');
    let expired = 0, reminded = 0;
    for (const v of vendors) {
        let dirty = false;
        for (const s of v.specialisms) {
            if (s.status !== 'approved' || !s.expiryDate) continue;
            if (new Date(s.expiryDate) < today) {
                s.status = 'expired';
                dirty = true;
                expired++;
                await notify({ to: 'vendor', id: v._id, event: 'specialism_expired', title: msg('Specialism badge expired'), body: msg('Your {{specialism}} badge expired. Upload renewed credentials to restore it.', { specialism: s.specialism }) });
            } else if (!s.reminderSentAt && new Date(s.expiryDate) <= addDays(today, 60)) {
                s.reminderSentAt = new Date();
                dirty = true;
                reminded++;
                await notify({ to: 'vendor', id: v._id, event: 'specialism_expiring', title: msg('Renew your specialism badge'), body: msg('Your {{specialism}} badge expires on {{date}}. Upload renewed credentials to keep it.', { specialism: s.specialism, date: storageDateStr(s.expiryDate) }) });
            }
        }
        if (dirty) await v.save();
    }
    return { expired, reminded };
};

// ─── Gap AE: menu coverage ───────────────────────────────────────────────────────────────────────────────

/** For the next N days: does every slot with deliveries have an uploaded menu? (VM-03 "Menu uploaded for X of next 10 days") */
export const menuCoverage = async (vendorId, { days } = {}) => {
    const span = Math.max(2, Math.min(Number(days) || Number((await getControl('calendarPreviewDays')).days) || 10, 14));
    const { DMBDailyMenu } = await import('../mealplan/dailyMenu.model.js');
    const { DMBSubscription } = await import('../subscription/subscription.model.js');
    const { deliveriesOn } = await import('../subscription/schedule.js');
    const { listSlots } = await import('../deliverySlot/deliverySlot.service.js');
    const today = localToday();
    const slotDefs = await listSlots();
    const subs = await DMBSubscription.find({ status: 'active', $or: [{ vendorId }, { vendorIds: vendorId }] }).lean();
    const out = [];
    for (let i = 1; i <= span; i++) {
        const date = addDays(today, i);
        const needed = new Set();
        for (const sub of subs) for (const dv of deliveriesOn(sub, date, { slotDefs })) if (String(dv.vendorId) === String(vendorId)) needed.add(dv.slot);
        const menus = await DMBDailyMenu.find({ vendorId, date }).select('slot').lean();
        const have = new Set(menus.map((m) => m.slot));
        const missing = [...needed].filter((s) => !have.has(s));
        out.push({ date: storageDateStr(date), neededSlots: [...needed], uploadedSlots: [...have], missing, confirmed: needed.size ? missing.length === 0 : have.size > 0 });
    }
    const confirmedDays = out.filter((d) => d.confirmed).length;
    return { days: span, confirmedDays, nudge: confirmedDays < Math.min(7, span), schedule: out };
};

/** Job (daily 10:00): remind vendors 48h before a day that still has no menu for slots with deliveries. */
export const menuReminderSweep = async () => {
    const vendors = await FoodRestaurant.find({ status: 'approved' }).select('_id').lean();
    let reminded = 0;
    for (const v of vendors) {
        const cov = await menuCoverage(v._id, { days: 2 });
        const day = cov.schedule.find((d) => d.date === storageDateStr(addDays(localToday(), 2)));
        if (day?.missing?.length) {
            reminded++;
            await notify({ to: 'vendor', id: v._id, event: 'menu_reminder', title: msg('Upload your menu for {{date}}', { date: day.date }), body: msg('Customers can already see {{date}} in their calendar. Add the dishes for: {{slots}}.', { date: day.date, slots: day.missing.join(', ') }) });
        }
    }
    return { reminded };
};

/** When a vendor confirms a future day's menu, subscribers with deliveries that day are told (event menu_confirmed). */
export const notifyMenuConfirmed = async (vendorId, date, slot) => {
    try {
        const { DMBDailyOrder } = await import('../subscription/dmb.dailyOrder.model.js');
        const day = typeof date === 'string' ? dateOnlyFromStr(date) : new Date(storageDateStr(date));
        if (!day || day <= addDays(localToday(), 1)) return; // tomorrow is covered by the evening preview
        const userIds = await DMBDailyOrder.distinct('userId', { vendorId, deliveryDate: day, deliverySlot: slot, status: 'scheduled' });
        const { DMBMenuNotice } = await menuNoticeModel();
        for (const userId of userIds) {
            const res = await DMBMenuNotice.updateOne({ userId, date: day }, { $setOnInsert: { userId, date: day } }, { upsert: true });
            if (!res.upsertedCount) continue;
            await notify({ to: 'customer', id: userId, event: 'menu_confirmed', title: msg('Menu confirmed for {{date}}', { date: storageDateStr(day) }), body: msg('Your maker has published the menu. Open your calendar to see it.'), link: '/user/calendar' });
        }
    } catch (err) {
        logger.warn(`[menu] confirm notice failed: ${err.message}`);
    }
};

const menuNoticeModel = async () => {
    if (!mongoose.models.DMBMenuNotice) {
        const schema = new mongoose.Schema({ userId: mongoose.Schema.Types.ObjectId, date: Date }, { collection: 'dmb_menu_notices', timestamps: true });
        schema.index({ userId: 1, date: 1 }, { unique: true });
        schema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 86400 });
        mongoose.model('DMBMenuNotice', schema);
    }
    return { DMBMenuNotice: mongoose.models.DMBMenuNotice };
};
