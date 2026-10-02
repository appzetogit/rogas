import mongoose from 'mongoose';
import crypto from 'crypto';
import { DMBPlatformControl, DMBAdminAlert } from './platform.models.js';
import { ACM_CONTROLS, ACM_BY_KEY, ACM_GROUPS, EU_LOCKED_VISIBILITY, coerceValue, defaultValueOf } from './acm.registry.js';
import { platformTimeZone } from '../../../utils/platformTime.js';
import { logger } from '../../../utils/logger.js';

const CACHE_MS = 15_000;
let docsCache = { at: 0, docs: null };
let zoneCityCache = { at: 0, map: new Map(), cityZones: new Map() };

export const invalidatePlatformConfig = () => {
    docsCache = { at: 0, docs: null };
};

const loadDocs = async () => {
    if (docsCache.docs && Date.now() - docsCache.at < CACHE_MS) return docsCache.docs;
    const docs = await DMBPlatformControl.find({}).lean();
    docsCache = { at: Date.now(), docs };
    return docs;
};

const loadZoneCities = async () => {
    if (Date.now() - zoneCityCache.at < 60_000) return zoneCityCache;
    const { AdminCity } = await import('../../food/admin/models/adminCity.model.js');
    const cities = await AdminCity.find({}).select('zoneIds name').lean();
    const map = new Map();
    const cityZones = new Map();
    for (const c of cities) {
        cityZones.set(String(c._id), (c.zoneIds || []).map(String));
        for (const z of c.zoneIds || []) map.set(String(z), String(c._id));
    }
    zoneCityCache = { at: Date.now(), map, cityZones };
    return zoneCityCache;
};

export const invalidateZoneCityCache = () => {
    zoneCityCache = { at: 0, map: new Map(), cityZones: new Map() };
};

/** The AdminCity a delivery zone belongs to (or null when the zone is not attached to any city). */
export const cityIdForZone = async (zoneId) => {
    if (!zoneId) return null;
    const { map } = await loadZoneCities();
    return map.get(String(zoneId)) || null;
};

export const zoneIdsForCity = async (cityId) => {
    if (!cityId) return [];
    const { cityZones } = await loadZoneCities();
    return cityZones.get(String(cityId)) || [];
};

const resolveCityId = async ({ cityId, zoneId } = {}) => {
    if (cityId && mongoose.Types.ObjectId.isValid(String(cityId))) return String(cityId);
    return cityIdForZone(zoneId);
};

const valueFrom = (docs, key, cityId) => docs.find((d) => d.key === key && String(d.cityId || '') === String(cityId || ''))?.value;

/**
 * Effective value of a control: registry default ← platform value ← city override (only for perCity controls).
 * ctx: { cityId } or { zoneId } (the zone's city is used).
 */
export const getControl = async (key, ctx = {}) => {
    const control = ACM_BY_KEY[key];
    if (!control) throw new Error(`Unknown platform control "${key}"`);
    const docs = await loadDocs();
    const value = { ...defaultValueOf(control), ...(valueFrom(docs, key, null) || {}) };
    if (control.perCity) {
        const cityId = await resolveCityId(ctx);
        if (cityId) Object.assign(value, valueFrom(docs, key, cityId) || {});
    }
    return value;
};

/** Shorthand for controls whose main field is `enabled`. */
export const isEnabled = async (key, ctx = {}) => Boolean((await getControl(key, ctx)).enabled);

/** Throws a 403-style error when a feature is switched off for this customer's city. */
export const assertEnabled = async (key, ctx = {}, message) => {
    if (!(await isEnabled(key, ctx))) {
        const err = new Error(message || 'This feature is not available in your area');
        err.statusCode = 403;
        err.code = 'FEATURE_DISABLED';
        throw err;
    }
};

/** Everything the apps need, for one city. Never contains secrets. `version` changes whenever any value changes. */
export const getPublicConfig = async (ctx = {}) => {
    const cityId = await resolveCityId(ctx);
    const controls = {};
    for (const control of ACM_CONTROLS) {
        if (control.public === false) continue;
        controls[control.key] = await getControl(control.key, { cityId });
    }
    const body = { timezone: platformTimeZone(), cityId: cityId || null, controls };
    const version = crypto.createHash('sha1').update(JSON.stringify(body)).digest('hex').slice(0, 12);
    return { ...body, version, refreshSeconds: 300 };
};

/** Admin view: every control with its platform value and (when cityId given) the city override. */
export const listControlsForAdmin = async ({ cityId } = {}) => {
    const docs = await loadDocs();
    const rows = ACM_CONTROLS.map((control) => {
        const platformDoc = docs.find((d) => d.key === control.key && !d.cityId);
        const cityDoc = cityId ? docs.find((d) => d.key === control.key && String(d.cityId) === String(cityId)) : null;
        const platformValue = { ...defaultValueOf(control), ...(platformDoc?.value || {}) };
        return {
            ...control,
            defaultValue: defaultValueOf(control),
            platformValue,
            cityOverride: cityDoc?.value || null,
            effectiveValue: control.perCity && cityDoc ? { ...platformValue, ...cityDoc.value } : platformValue,
            updatedAt: (cityDoc || platformDoc)?.updatedAt || null,
            updatedByEmail: (cityDoc || platformDoc)?.updatedByEmail || ''
        };
    });
    return { groups: ACM_GROUPS, controls: rows, euLocked: EU_LOCKED_VISIBILITY };
};

const permissionError = (message) => {
    const err = new Error(message);
    err.statusCode = 403;
    return err;
};

/**
 * Changes a control. Who may change what follows the matrix: SUPER_ADMIN everything; the roles listed on the
 * control may change it too, and a CITY_MANAGER only for a city assigned to them.
 */
export const setControl = async ({ key, cityId = null, value, admin, reason = '', req = null }) => {
    const control = ACM_BY_KEY[key];
    if (!control) throw new Error(`Unknown control "${key}"`);
    const role = admin?.adminRole || 'SUPER_ADMIN';
    if (role !== 'SUPER_ADMIN' && !(control.roles || []).includes(role)) {
        throw permissionError(`ACM-${control.acm} can only be changed by ${['SUPER_ADMIN', ...(control.roles || [])].join(', ')}`);
    }
    if (cityId && !control.perCity) throw new Error(`ACM-${control.acm} is platform-wide and cannot be set per city`);
    if (cityId && !mongoose.Types.ObjectId.isValid(String(cityId))) throw new Error('Invalid cityId');
    if (role === 'CITY_MANAGER') {
        const assigned = (admin?.assignedCityIds || []).map(String);
        if (!cityId || !assigned.includes(String(cityId))) throw permissionError('City Managers can only change controls for their own city');
    }
    const clean = coerceValue(control, value || {});
    if (!Object.keys(clean).length) throw new Error('Nothing to change');

    const filter = { key, cityId: cityId || null };
    const existing = await DMBPlatformControl.findOne(filter).lean();
    const next = { ...(existing?.value || {}), ...clean };
    const doc = await DMBPlatformControl.findOneAndUpdate(
        filter,
        { $set: { value: next, previousValue: existing?.value || null, updatedBy: admin?._id || null, updatedByEmail: admin?.email || '' } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
    invalidatePlatformConfig();

    try {
        const { writeAudit } = await import('../../food/admin/services/prdAdmin.service.js');
        await writeAudit(req, 'acm.update', 'PlatformControl', `ACM-${control.acm}`, { cityId, value: existing?.value || null }, { cityId, value: next }, reason);
    } catch (err) {
        logger.warn(`[acm] audit write failed: ${err.message}`);
    }
    return doc;
};

/** Removes a city override so the city follows the platform value again. */
export const clearCityOverride = async ({ key, cityId, admin, req = null }) => {
    const control = ACM_BY_KEY[key];
    if (!control) throw new Error(`Unknown control "${key}"`);
    const role = admin?.adminRole || 'SUPER_ADMIN';
    if (role !== 'SUPER_ADMIN' && !(control.roles || []).includes(role)) throw permissionError('Not allowed');
    if (role === 'CITY_MANAGER' && !(admin?.assignedCityIds || []).map(String).includes(String(cityId))) throw permissionError('City Managers can only change their own city');
    const removed = await DMBPlatformControl.findOneAndDelete({ key, cityId }).lean();
    invalidatePlatformConfig();
    if (removed) {
        try {
            const { writeAudit } = await import('../../food/admin/services/prdAdmin.service.js');
            await writeAudit(req, 'acm.clear_city_override', 'PlatformControl', `ACM-${control.acm}`, { cityId, value: removed.value }, null, '');
        } catch { /* audit is best-effort */ }
    }
    return { cleared: Boolean(removed) };
};

// ─── AP-01 alerts ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Raises an admin alert. With a dedupeKey the alert is created once (include the period in the key, e.g.
 * "noshow:<shiftId>" or "track1:<vendorId>:2026-10"). Never throws — an alert must not break the job raising it.
 */
export const raiseAdminAlert = async ({ type, severity = 'warning', title, message = '', cityId = null, entityType = '', entityId = '', link = '', data = {}, dedupeKey = null }) => {
    try {
        if (dedupeKey) {
            const res = await DMBAdminAlert.updateOne(
                { dedupeKey },
                { $setOnInsert: { type, severity, title, message, cityId, entityType, entityId: String(entityId || ''), link, data, dedupeKey, status: 'open' } },
                { upsert: true }
            );
            return { created: Boolean(res.upsertedCount) };
        }
        await DMBAdminAlert.create({ type, severity, title, message, cityId, entityType, entityId: String(entityId || ''), link, data });
        return { created: true };
    } catch (err) {
        if (err?.code === 11000) return { created: false };
        logger.warn(`[alerts] could not raise ${type}: ${err.message}`);
        return { created: false };
    }
};

export const listAdminAlerts = async ({ status = 'open', type, cityIds, limit = 100, page = 1 } = {}) => {
    const filter = {};
    if (status && status !== 'all') filter.status = status;
    if (type) filter.type = type;
    if (cityIds?.length) filter.$or = [{ cityId: { $in: cityIds } }, { cityId: null }];
    const lim = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const skip = (Math.max(Number(page) || 1, 1) - 1) * lim;
    const [alerts, total, openCount] = await Promise.all([
        DMBAdminAlert.find(filter).sort({ createdAt: -1 }).skip(skip).limit(lim).lean(),
        DMBAdminAlert.countDocuments(filter),
        DMBAdminAlert.countDocuments({ ...filter, status: 'open' })
    ]);
    return { alerts, total, openCount };
};

export const updateAdminAlertStatus = async (id, status, adminId) => {
    if (!['open', 'acknowledged', 'resolved'].includes(status)) throw new Error('Invalid status');
    const doc = await DMBAdminAlert.findByIdAndUpdate(
        id,
        { $set: { status, acknowledgedBy: adminId || null, acknowledgedAt: status === 'open' ? null : new Date() } },
        { new: true }
    ).lean();
    if (!doc) throw new Error('Alert not found');
    return doc;
};
