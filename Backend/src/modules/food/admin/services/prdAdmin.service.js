import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { FoodRestaurant } from '../../restaurant/models/restaurant.model.js';
import { FoodDeliveryPartner } from '../../delivery/models/deliveryPartner.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { createOrder } from '../../orders/services/order.service.js';
import { FoodSupportTicket } from '../../user/models/supportTicket.model.js';
import { FoodZone } from '../models/zone.model.js';
import { FleetPartner } from '../../../dailymealbox/vendor/fleetPartner.model.js';
import { AdminAuditLog } from '../models/auditLog.model.js';
import { AdminCity } from '../models/adminCity.model.js';
import { AdminFeatureToggle } from '../models/featureToggle.model.js';
import { AdminIntegrationSetting } from '../models/integrationSetting.model.js';
import { AdminEnvironmentSetting } from '../models/environmentSetting.model.js';
import { AdminOtaConfig } from '../models/otaConfig.model.js';
import { DriverDocumentReview } from '../models/driverDocumentReview.model.js';
import {
    ADMIN_PRD_PERMISSIONS,
    ADMIN_PRD_ROLES,
    DEFAULT_FEATURE_TOGGLES,
    FEATURE_TOGGLE_CATEGORIES,
    FEATURE_TOGGLE_STATES
} from '../constants/adminPrd.js';

const objectIdOrNull = (value) =>
    value && mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : null;

const normalizeAdminRole = (value) => {
    const role = String(value || '').trim().toUpperCase();
    if (!ADMIN_PRD_ROLES.includes(role)) {
        throw new ValidationError(`adminRole must be one of: ${ADMIN_PRD_ROLES.join(', ')}`);
    }
    return role;
};

const getActorMeta = (req) => ({
    actorId: objectIdOrNull(req?.user?.userId || req?.user?._id),
    actorEmail: req?.adminProfile?.email || '',
    actorRole: req?.adminProfile?.adminRole || req?.user?.role || '',
    ip: req?.ip || '',
    userAgent: req?.headers?.['user-agent'] || ''
});

export async function writeAudit(req, action, entityType, entityId, previousValue, newValue, reason = '') {
    const cityId = objectIdOrNull(newValue?.cityId || previousValue?.cityId);
    return AdminAuditLog.create({
        ...getActorMeta(req),
        action,
        entityType,
        entityId: entityId ? String(entityId) : '',
        cityId,
        previousValue: previousValue ?? null,
        newValue: newValue ?? null,
        reason: String(reason || '').trim()
    });
}

export function getRoleMatrix() {
    return ADMIN_PRD_ROLES.map((role) => ({
        role,
        permissions: ADMIN_PRD_PERMISSIONS[role] || []
    }));
}

export async function listAdminUsers(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = {};
    if (query.adminRole) filter.adminRole = normalizeAdminRole(query.adminRole);
    if (query.search) {
        const regex = { $regex: String(query.search).trim(), $options: 'i' };
        filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }
    const [admins, total] = await Promise.all([
        FoodAdmin.find(filter)
            .select('-password')
            .populate('assignedCityIds', 'name country status currency')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean(),
        FoodAdmin.countDocuments(filter)
    ]);
    return { admins, total, page, limit };
}

export async function updateAdminRole(adminId, body = {}, req) {
    if (!objectIdOrNull(adminId)) throw new ValidationError('Invalid admin id');
    const admin = await FoodAdmin.findById(adminId);
    if (!admin) return null;
    const before = admin.toObject();
    if (body.adminRole !== undefined) admin.adminRole = normalizeAdminRole(body.adminRole);
    if (body.assignedCityIds !== undefined) {
        admin.assignedCityIds = Array.isArray(body.assignedCityIds)
            ? body.assignedCityIds.filter((id) => objectIdOrNull(id)).map((id) => objectIdOrNull(id))
            : [];
    }
    if (body.permissions !== undefined) {
        admin.permissions = Array.isArray(body.permissions)
            ? body.permissions.map((p) => String(p).trim()).filter(Boolean)
            : [];
    }
    if (body.isActive !== undefined) admin.isActive = body.isActive !== false;
    await admin.save();
    const after = admin.toObject();
    delete after.password;
    await writeAudit(req, 'admin.role.update', 'FoodAdmin', admin._id, before, after, body.reason);
    return after;
}

export async function listAuditLogs(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 500);
    const page = Math.max(parseInt(query.page, 10) || 1, 1);
    const skip = (page - 1) * limit;
    const filter = {};
    if (query.actorId && objectIdOrNull(query.actorId)) filter.actorId = objectIdOrNull(query.actorId);
    if (query.action) filter.action = String(query.action).trim();
    if (query.entityType) filter.entityType = String(query.entityType).trim();
    if (query.cityId && objectIdOrNull(query.cityId)) filter.cityId = objectIdOrNull(query.cityId);
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) filter.createdAt.$lte = new Date(query.to);
    }
    const [logs, total] = await Promise.all([
        AdminAuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AdminAuditLog.countDocuments(filter)
    ]);
    return { logs, total, page, limit };
}

async function computeCityChecklist(city) {
    const cityName = city?.name || '';
    const cityId = city?._id;
    const [approvedVendors, approvedDrivers, zones] = await Promise.all([
        FoodRestaurant.countDocuments({ status: 'approved', $or: [{ city: cityName }, { zoneId: { $in: city.zoneIds || [] } }] }),
        FoodDeliveryPartner.countDocuments({ status: 'approved', $or: [{ city: cityName }, { zoneIds: { $in: city.zoneIds || [] } }] }),
        FoodZone.countDocuments({ _id: { $in: city.zoneIds || [] }, isActive: true })
    ]);
    const hasGateway = (city.paymentGateways || []).some((g) => g.isActive);
    const hasLanguage = (city.enabledLanguages || []).length > 0;
    return {
        hasApprovedVendor: approvedVendors > 0,
        hasApprovedDriver: approvedDrivers > 0,
        hasZone: zones > 0,
        hasGateway,
        hasLanguage,
        cityId
    };
}

export async function listCities(query = {}) {
    const filter = {};
    if (query.status) filter.status = String(query.status).trim();
    const cities = await AdminCity.find(filter).sort({ name: 1 }).lean();
    return { cities };
}

export async function createCity(body = {}, req) {
    const name = String(body.name || '').trim();
    const country = String(body.country || '').trim();
    if (!name || !country) throw new ValidationError('City name and country are required');
    const city = await AdminCity.create({
        name,
        country,
        status: body.status || 'planned',
        currency: String(body.currency || 'INR').trim().toUpperCase(),
        vatRate: Number(body.vatRate || 0),
        defaultLanguage: String(body.defaultLanguage || 'en').trim(),
        enabledLanguages: Array.isArray(body.enabledLanguages) ? body.enabledLanguages : ['en'],
        paymentGateways: Array.isArray(body.paymentGateways) ? body.paymentGateways : [],
        zoneIds: Array.isArray(body.zoneIds) ? body.zoneIds.filter((id) => objectIdOrNull(id)) : [],
        metadata: body.metadata || {},
        createdBy: objectIdOrNull(req?.user?.userId)
    });
    city.activationChecklist = await computeCityChecklist(city);
    await city.save();
    await writeAudit(req, 'city.create', 'AdminCity', city._id, null, city.toObject(), body.reason);
    return city.toObject();
}

export async function updateCity(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid city id');
    const city = await AdminCity.findById(id);
    if (!city) return null;
    const before = city.toObject();
    ['name', 'country', 'status', 'currency', 'defaultLanguage'].forEach((field) => {
        if (body[field] !== undefined) city[field] = String(body[field]).trim();
    });
    if (body.vatRate !== undefined) city.vatRate = Number(body.vatRate || 0);
    if (body.enabledLanguages !== undefined) city.enabledLanguages = Array.isArray(body.enabledLanguages) ? body.enabledLanguages : [];
    if (body.paymentGateways !== undefined) city.paymentGateways = Array.isArray(body.paymentGateways) ? body.paymentGateways : [];
    if (body.zoneIds !== undefined) city.zoneIds = Array.isArray(body.zoneIds) ? body.zoneIds.filter((zoneId) => objectIdOrNull(zoneId)) : [];
    if (body.metadata !== undefined) city.metadata = body.metadata || {};
    city.updatedBy = objectIdOrNull(req?.user?.userId);
    city.activationChecklist = await computeCityChecklist(city);
    await city.save();
    const after = city.toObject();
    await writeAudit(req, 'city.update', 'AdminCity', city._id, before, after, body.reason);
    return after;
}

export async function getCityChecklist(id) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid city id');
    const city = await AdminCity.findById(id);
    if (!city) return null;
    const checklist = await computeCityChecklist(city);
    city.activationChecklist = checklist;
    await city.save();
    const complete = Object.entries(checklist).filter(([key]) => key !== 'cityId').every(([, value]) => Boolean(value));
    return { checklist, complete };
}

export async function seedDefaultFeatureToggles() {
    const created = [];
    for (const item of DEFAULT_FEATURE_TOGGLES) {
        const doc = await AdminFeatureToggle.findOneAndUpdate(
            { key: item.key, scope: 'platform', cityId: null },
            { $setOnInsert: { ...item, scope: 'platform', state: 'on' } },
            { upsert: true, new: true }
        ).lean();
        created.push(doc);
    }
    return created;
}

export async function listFeatureToggles(query = {}) {
    await seedDefaultFeatureToggles();
    const filter = {};
    if (query.category) filter.category = String(query.category).trim();
    if (query.scope) filter.scope = String(query.scope).trim();
    if (query.cityId && objectIdOrNull(query.cityId)) filter.cityId = objectIdOrNull(query.cityId);
    const toggles = await AdminFeatureToggle.find(filter).sort({ category: 1, key: 1 }).lean();
    return { categories: FEATURE_TOGGLE_CATEGORIES, states: FEATURE_TOGGLE_STATES, toggles };
}

export async function upsertFeatureToggle(body = {}, req) {
    const key = String(body.key || '').trim();
    const label = String(body.label || key).trim();
    const category = String(body.category || 'ordering').trim();
    const state = String(body.state || 'on').trim().toLowerCase();
    const scope = body.cityId ? 'city' : String(body.scope || 'platform').trim();
    const cityId = body.cityId ? objectIdOrNull(body.cityId) : null;
    if (!key) throw new ValidationError('Feature key is required');
    if (!FEATURE_TOGGLE_STATES.includes(state)) throw new ValidationError('Invalid feature state');
    const existing = await AdminFeatureToggle.findOne({ key, scope, cityId });
    const before = existing?.toObject?.() || null;
    const update = {
        key,
        label,
        category,
        scope,
        cityId,
        state,
        config: body.config || {},
        previousState: existing?.state || null,
        previousConfig: existing?.config || null,
        lastChangedBy: objectIdOrNull(req?.user?.userId),
        lastChangedAt: new Date(),
        rollbackUntil: new Date(Date.now() + 24 * 60 * 60 * 1000)
    };
    if (body.scheduledRunAt) {
        update.$push = {
            scheduledChanges: {
                state,
                runAt: new Date(body.scheduledRunAt),
                reason: body.reason || '',
                createdBy: objectIdOrNull(req?.user?.userId)
            }
        };
        update.state = existing?.state || 'on';
    }
    const pushUpdate = update.$push;
    delete update.$push;
    const setUpdate = pushUpdate ? { $set: update, $push: pushUpdate } : { $set: update };
    const doc = await AdminFeatureToggle.findOneAndUpdate(
        { key, scope, cityId },
        setUpdate,
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await writeAudit(req, body.scheduledRunAt ? 'featureToggle.schedule' : 'featureToggle.update', 'AdminFeatureToggle', doc._id, before, doc, body.reason);
    return doc;
}

export async function rollbackFeatureToggle(id, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid feature toggle id');
    const toggle = await AdminFeatureToggle.findById(id);
    if (!toggle) return null;
    if (!toggle.previousState || !toggle.rollbackUntil || toggle.rollbackUntil < new Date()) {
        throw new ValidationError('Rollback window has expired');
    }
    const before = toggle.toObject();
    toggle.state = toggle.previousState;
    toggle.config = toggle.previousConfig || {};
    toggle.previousState = null;
    toggle.previousConfig = null;
    toggle.rollbackUntil = null;
    toggle.lastChangedBy = objectIdOrNull(req?.user?.userId);
    toggle.lastChangedAt = new Date();
    await toggle.save();
    const after = toggle.toObject();
    await writeAudit(req, 'featureToggle.rollback', 'AdminFeatureToggle', toggle._id, before, after, 'Rollback to previous state');
    return after;
}

export async function listIntegrations(query = {}) {
    const filter = {};
    if (query.environment) filter.environment = String(query.environment).trim();
    if (query.cityId && objectIdOrNull(query.cityId)) filter.cityId = objectIdOrNull(query.cityId);
    const integrations = await AdminIntegrationSetting.find(filter).sort({ provider: 1 }).lean();
    return { integrations };
}

export async function upsertIntegration(body = {}, req) {
    const provider = String(body.provider || '').trim();
    if (!provider) throw new ValidationError('Provider is required');
    const environment = String(body.environment || 'prod').trim();
    const cityId = body.cityId ? objectIdOrNull(body.cityId) : null;
    const existing = await AdminIntegrationSetting.findOne({ provider, environment, cityId });
    const before = existing?.toObject?.() || null;
    const doc = await AdminIntegrationSetting.findOneAndUpdate(
        { provider, environment, cityId },
        {
            $set: {
                provider,
                label: String(body.label || provider).trim(),
                category: String(body.category || 'integration').trim(),
                environment,
                cityId,
                status: body.status || 'active',
                publicConfig: body.publicConfig || {},
                secretRefs: body.secretRefs || {},
                requires2fa: body.requires2fa !== false,
                lastCheckedAt: body.lastCheckedAt ? new Date(body.lastCheckedAt) : existing?.lastCheckedAt || null,
                lastChangedBy: objectIdOrNull(req?.user?.userId)
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await writeAudit(req, 'integration.upsert', 'AdminIntegrationSetting', doc._id, before, doc, body.reason);
    return doc;
}

export async function listEnvironments() {
    const environments = await AdminEnvironmentSetting.find({}).sort({ environment: 1 }).lean();
    return { environments };
}

export async function upsertEnvironment(body = {}, req) {
    const environment = String(body.environment || '').trim();
    if (!['dev', 'qa', 'prod'].includes(environment)) throw new ValidationError('Environment must be dev, qa, or prod');
    const existing = await AdminEnvironmentSetting.findOne({ environment });
    const before = existing?.toObject?.() || null;
    const doc = await AdminEnvironmentSetting.findOneAndUpdate(
        { environment },
        {
            $set: {
                isActive: body.isActive === true,
                apiBaseUrl: String(body.apiBaseUrl || '').trim(),
                adminBaseUrl: String(body.adminBaseUrl || '').trim(),
                appVersion: String(body.appVersion || '').trim(),
                releaseChannel: String(body.releaseChannel || 'stable').trim(),
                maintenanceMode: body.maintenanceMode === true,
                config: body.config || {},
                updatedBy: objectIdOrNull(req?.user?.userId)
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await writeAudit(req, 'environment.upsert', 'AdminEnvironmentSetting', doc._id, before, doc, body.reason);
    return doc;
}

export async function listOtaConfigs(query = {}) {
    const filter = {};
    if (query.type) filter.type = String(query.type).trim();
    if (query.status) filter.status = String(query.status).trim();
    if (query.languageCode) filter.languageCode = String(query.languageCode).trim();
    if (query.cityId && objectIdOrNull(query.cityId)) filter.cityId = objectIdOrNull(query.cityId);
    const configs = await AdminOtaConfig.find(filter).sort({ updatedAt: -1 }).lean();
    return { configs };
}

const validateLanguagePayload = (payload = {}) => {
    const missing = [];
    ['app.name', 'common.save', 'common.cancel'].forEach((key) => {
        const value = key.split('.').reduce((acc, part) => acc?.[part], payload);
        if (value === undefined || value === '') missing.push(key);
    });
    return { valid: missing.length === 0, missingKeys: missing };
};

export async function createOtaConfig(body = {}, req) {
    const type = String(body.type || '').trim();
    if (!['theme', 'language'].includes(type)) throw new ValidationError('OTA type must be theme or language');
    const validation = type === 'language' ? validateLanguagePayload(body.payload || {}) : { valid: true, missingKeys: [] };
    const latest = await AdminOtaConfig.findOne({
        cityId: body.cityId ? objectIdOrNull(body.cityId) : null,
        type,
        languageCode: String(body.languageCode || '').trim()
    }).sort({ version: -1 }).lean();
    const doc = await AdminOtaConfig.create({
        cityId: body.cityId ? objectIdOrNull(body.cityId) : null,
        type,
        languageCode: String(body.languageCode || '').trim(),
        version: Number(latest?.version || 0) + 1,
        status: validation.valid ? (body.status || 'draft') : 'draft',
        payload: body.payload || {},
        validation,
        createdBy: objectIdOrNull(req?.user?.userId),
        updatedBy: objectIdOrNull(req?.user?.userId)
    });
    await writeAudit(req, 'ota.create', 'AdminOtaConfig', doc._id, null, doc.toObject(), body.reason);
    return doc.toObject();
}

export async function publishOtaConfig(id, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid OTA config id');
    const config = await AdminOtaConfig.findById(id);
    if (!config) return null;
    if (config.validation && config.validation.valid === false) {
        throw new ValidationError('Cannot publish OTA config with validation errors');
    }
    const before = config.toObject();
    config.status = 'published';
    config.publishedAt = new Date();
    config.updatedBy = objectIdOrNull(req?.user?.userId);
    await config.save();
    const after = config.toObject();
    await writeAudit(req, 'ota.publish', 'AdminOtaConfig', config._id, before, after, 'Published OTA config');
    return after;
}

export async function getFleetDashboard() {
    const now = new Date();
    const in60Days = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
    const [
        partnersTotal,
        partnersActive,
        pendingDocs,
        expiringDocs,
        pendingInvoices,
        driversTotal
    ] = await Promise.all([
        FleetPartner.countDocuments({}),
        FleetPartner.countDocuments({ status: 'active' }),
        DriverDocumentReview.countDocuments({ status: 'pending_review' }),
        DriverDocumentReview.countDocuments({ expiryDate: { $gte: now, $lte: in60Days }, status: { $in: ['approved', 'expiring'] } }),
        FleetPartner.countDocuments({ 'invoices.status': 'pending' }),
        FoodDeliveryPartner.countDocuments({})
    ]);
    return {
        partnersTotal,
        partnersActive,
        driversTotal,
        pendingDocs,
        expiringDocs,
        pendingInvoices
    };
}

export async function listFleetPartners(query = {}) {
    const filter = {};
    if (query.status) filter.status = String(query.status).trim();
    if (query.city) filter.city = String(query.city).trim();
    if (query.search) {
        const regex = { $regex: String(query.search).trim(), $options: 'i' };
        filter.$or = [{ companyName: regex }, { contactEmail: regex }, { contactPhone: regex }, { nip: regex }];
    }
    const partners = await FleetPartner.find(filter).sort({ createdAt: -1 }).lean();
    return { partners };
}

export async function createFleetPartner(body = {}, req) {
    const companyName = String(body.companyName || '').trim();
    const city = String(body.city || '').trim();
    if (!companyName || !city) throw new ValidationError('Company name and city are required');
    const partner = await FleetPartner.create({
        companyName,
        city,
        nip: body.nip || '',
        bankIban: body.bankIban || '',
        contactName: body.contactName || '',
        contactPhone: body.contactPhone || '',
        contactEmail: body.contactEmail || '',
        status: body.status || 'active',
        deliveryVatRate: Number(body.deliveryVatRate ?? 0.23),
        approvedByAdminId: objectIdOrNull(req?.user?.userId)
    });
    await writeAudit(req, 'fleetPartner.create', 'FleetPartner', partner._id, null, partner.toObject(), body.reason);
    return partner.toObject();
}

export async function updateFleetPartnerStatus(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid fleet partner id');
    const partner = await FleetPartner.findById(id);
    if (!partner) return null;
    const before = partner.toObject();
    const status = String(body.status || '').trim();
    if (!['active', 'suspended'].includes(status)) throw new ValidationError('Status must be active or suspended');
    partner.status = status;
    if (status === 'suspended') {
        await FoodDeliveryPartner.updateMany({ fleetPartnerId: partner._id }, { $set: { status: 'rejected', rejectionReason: body.reason || 'Fleet partner suspended' } });
    }
    await partner.save();
    const after = partner.toObject();
    await writeAudit(req, `fleetPartner.${status}`, 'FleetPartner', partner._id, before, after, body.reason);
    return after;
}

export async function listDriverDocuments(query = {}) {
    const filter = {};
    if (query.status) filter.status = String(query.status).trim();
    if (query.fleetPartnerId && objectIdOrNull(query.fleetPartnerId)) filter.fleetPartnerId = objectIdOrNull(query.fleetPartnerId);
    if (query.driverId && objectIdOrNull(query.driverId)) filter.driverId = objectIdOrNull(query.driverId);
    const documents = await DriverDocumentReview.find(filter)
        .populate('driverId', 'name phone city status fleetPartnerId')
        .populate('fleetPartnerId', 'companyName city status')
        .sort({ createdAt: -1 })
        .lean();
    return { documents };
}

export async function upsertDriverDocument(body = {}, req) {
    const driverId = objectIdOrNull(body.driverId);
    if (!driverId) throw new ValidationError('driverId is required');
    const documentType = String(body.documentType || '').trim();
    const driver = await FoodDeliveryPartner.findById(driverId).select('fleetPartnerId').lean();
    if (!driver) throw new ValidationError('Driver not found');
    const existing = await DriverDocumentReview.findOne({ driverId, documentType });
    const before = existing?.toObject?.() || null;
    const doc = await DriverDocumentReview.findOneAndUpdate(
        { driverId, documentType },
        {
            $set: {
                fleetPartnerId: body.fleetPartnerId ? objectIdOrNull(body.fleetPartnerId) : driver.fleetPartnerId || null,
                documentUrl: String(body.documentUrl || '').trim(),
                expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
                status: body.status || 'pending_review',
                rejectionReason: body.rejectionReason || ''
            }
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    await writeAudit(req, 'driverDocument.upsert', 'DriverDocumentReview', doc._id, before, doc, body.reason);
    return doc;
}

export async function reviewDriverDocument(id, body = {}, req) {
    if (!objectIdOrNull(id)) throw new ValidationError('Invalid document id');
    const doc = await DriverDocumentReview.findById(id);
    if (!doc) return null;
    const status = String(body.status || '').trim();
    if (!['approved', 'rejected', 'needs_reupload'].includes(status)) {
        throw new ValidationError('Status must be approved, rejected, or needs_reupload');
    }
    const before = doc.toObject();
    doc.status = status;
    doc.rejectionReason = status === 'approved' ? '' : String(body.reason || '').trim();
    doc.reviewedBy = objectIdOrNull(req?.user?.userId);
    doc.reviewedAt = new Date();
    doc.history.push({ status, reason: doc.rejectionReason, adminId: doc.reviewedBy, at: new Date() });
    await doc.save();

    const pendingCount = await DriverDocumentReview.countDocuments({
        driverId: doc.driverId,
        status: { $in: ['pending_review', 'rejected', 'needs_reupload', 'expired'] }
    });
    if (pendingCount === 0) {
        await FoodDeliveryPartner.findByIdAndUpdate(doc.driverId, { $set: { status: 'approved', approvedAt: new Date() } });
    }

    const after = doc.toObject();
    await writeAudit(req, `driverDocument.${status}`, 'DriverDocumentReview', doc._id, before, after, body.reason);
    return after;
}

const getGeoPoint = (value = {}) => {
    const lat = Number(value.latitude ?? value.lat ?? value.coordinates?.[1]);
    const lng = Number(value.longitude ?? value.lng ?? value.coordinates?.[0]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
};

const getRestaurantPoint = (restaurant = {}) => getGeoPoint(restaurant.location || {});

const getDeliveryPoint = (address = {}) => getGeoPoint(address.location || {});

const formatAddress = (address = {}) =>
    [address.street, address.additionalDetails, address.city, address.state, address.zipCode]
        .filter(Boolean)
        .join(', ');

// Returns true if lastLocationAt is within `seconds` seconds of now
const isLocationFresh = (at, seconds = 600) => {
    if (!at) return false;
    return Date.now() - new Date(at).getTime() <= seconds * 1000;
};

export async function getOperationsSnapshot(query = {}) {
    const city = query.city ? String(query.city).trim() : null;
    const driverFilter = city ? { city } : {};
    const vendorFilter = city ? { city } : {};
    const orderCityFilter = city ? { 'deliveryAddress.city': city } : {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [driversRaw, pendingPickups, completedToday, zones, vendors, assignedOrders, deliveredTotals] = await Promise.all([
        FoodDeliveryPartner.find(driverFilter)
            .select('name phone status availabilityStatus isOnline lastLat lastLng lastLocationAt vehicleType deliveriesToday earningsToday rating zoneIds city')
            .populate('zoneIds', 'name zoneName')
            .lean(),
        FoodOrder.find({ ...orderCityFilter, orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup'] } })
            .select('orderId order_id restaurantId dispatch deliveryPartnerId orderStatus createdAt deliveryAddress')
            .populate('restaurantId', 'restaurantName location city area ownerPhone')
            .lean(),
        FoodOrder.find({ ...orderCityFilter, orderStatus: 'delivered', updatedAt: { $gte: today } })
            .select('orderId order_id deliveryAddress dispatch deliveryPartnerId updatedAt')
            .lean(),
        FoodZone.find({ isActive: true }).select('name zoneName coordinates').lean(),
        FoodRestaurant.find(vendorFilter)
            .select('restaurantName location city area status ownerPhone zoneId')
            .lean(),
        FoodOrder.find({
            ...orderCityFilter,
            orderStatus: { $in: ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop'] },
            'dispatch.deliveryPartnerId': { $ne: null }
        })
            .select('orderId order_id restaurantId dispatch deliveryPartnerId orderStatus deliveryState deliveryAddress customerName customerPhone createdAt updatedAt')
            .populate('restaurantId', 'restaurantName location city area ownerPhone')
            .sort({ updatedAt: -1 })
            .limit(500)
            .lean(),
        FoodOrder.aggregate([
            { $match: { orderStatus: 'delivered', 'dispatch.deliveryPartnerId': { $ne: null } } },
            { $group: { _id: '$dispatch.deliveryPartnerId', deliveredOrdersCount: { $sum: 1 } } }
        ])
    ]);

    const deliveredCountByDriver = new Map(
        deliveredTotals.map((item) => [String(item._id), Number(item.deliveredOrdersCount) || 0])
    );
    const assignedByDriver = new Map();

    assignedOrders.forEach((order) => {
        const driverId = String(order.dispatch?.deliveryPartnerId || order.deliveryPartnerId || '');
        if (!driverId) return;

        const vendorPoint = getRestaurantPoint(order.restaurantId);
        const destinationPoint = getDeliveryPoint(order.deliveryAddress);
        const assignedDelivery = {
            _id: order._id,
            orderId: order.orderId || order.order_id || String(order._id),
            status: order.orderStatus,
            phase: order.deliveryState?.currentPhase || '',
            customerName: order.customerName || order.deliveryAddress?.fullName || order.deliveryAddress?.name || '',
            customerPhone: order.customerPhone || order.deliveryAddress?.phone || '',
            address: formatAddress(order.deliveryAddress),
            vendor: order.restaurantId ? {
                _id: order.restaurantId._id,
                name: order.restaurantId.restaurantName,
                area: order.restaurantId.area,
                location: vendorPoint
            } : null,
            destination: destinationPoint,
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        };

        const list = assignedByDriver.get(driverId) || [];
        list.push(assignedDelivery);
        assignedByDriver.set(driverId, list);
    });

    const drivers = driversRaw.map((driver) => {
        const driverId = String(driver._id);
        const assignedDeliveries = assignedByDriver.get(driverId) || [];
        const currentLocation = getGeoPoint({ lat: driver.lastLat, lng: driver.lastLng });
        const routePoints = [];

        if (currentLocation) {
            routePoints.push({ type: 'driver', label: driver.name || 'Delivery partner', ...currentLocation });
        }

        assignedDeliveries.forEach((delivery) => {
            if (delivery.vendor?.location && !['picked_up', 'reached_drop'].includes(delivery.status)) {
                routePoints.push({
                    type: 'pickup',
                    orderId: delivery.orderId,
                    label: delivery.vendor.name || '',
                    ...delivery.vendor.location
                });
            }
            if (delivery.destination) {
                routePoints.push({
                    type: 'dropoff',
                    orderId: delivery.orderId,
                    label: delivery.customerName || delivery.address || 'Delivery destination',
                    ...delivery.destination
                });
            }
        });

        // Driver is online if:
        // 1. DB flag isOnline=true OR availabilityStatus='online'
        // 2. We do NOT require location freshness as a hard gate - the driver
        //    may simply be standing still or have slow connectivity.
        const isDbOnline = driver.isOnline === true || driver.availabilityStatus === 'online';
        // Only mark offline if we have NEVER received a location AND they are not flagged online
        const isOnline = isDbOnline;

        return {
            ...driver,
            isOnline,
            availabilityStatus: isOnline ? 'online' : 'offline',
            deliveredOrdersCount: deliveredCountByDriver.get(driverId) || driver.deliveriesToday || 0,
            assignedDeliveries,
            pendingDestinations: assignedDeliveries.map((delivery) => delivery.destination).filter(Boolean),
            routePoints,
            activeOrderId: assignedDeliveries[0]?.orderId || null
        };
    });

    return {
        drivers,
        pendingPickups,
        completedToday,
        zones,
        vendors,
        stats: {
            online: drivers.filter((d) => d.isOnline).length,
            active: drivers.filter((d) => d.status === 'approved').length,
            delivered: completedToday.length,
            pendingPickups: pendingPickups.length,
            assignedDeliveries: assignedOrders.length,
            vendors: vendors.length
        }
    };
}

export async function getFraudAlerts(query = {}) {
    const limit = Math.min(Math.max(parseInt(query.limit, 10) || 50, 1), 200);
    const highRefundUsers = await FoodSupportTicket.aggregate([
        { $match: { issueType: { $regex: 'refund', $options: 'i' } } },
        { $group: { _id: '$userId', count: { $sum: 1 }, lastAt: { $max: '$createdAt' } } },
        { $match: { count: { $gte: 3 } } },
        { $sort: { count: -1 } },
        { $limit: limit }
    ]);
    return {
        alerts: highRefundUsers.map((item) => ({
            type: 'high_refund_rate',
            severity: 'medium',
            userId: item._id,
            count: item.count,
            lastAt: item.lastAt,
            status: 'open'
        }))
    };
}

export async function createManualOrder(body = {}, req) {
    const userId = objectIdOrNull(body.userId || body.customerId);
    if (!userId) throw new ValidationError('userId is required for manual order entry');
    const dto = {
        ...body,
        paymentMethod: body.paymentMethod || 'cash'
    };
    delete dto.userId;
    delete dto.customerId;
    const result = await createOrder(String(userId), dto);
    await writeAudit(req, 'order.manual.create', 'FoodOrder', result?.order?._id || result?.orderId || '', null, result, body.reason || 'Manual order entry');
    return result;
}
