import mongoose from 'mongoose';

/**
 * Delivery-zone checks for addresses (Gap U).
 * Zones are stored as lat/lng polygons (FoodZone.coordinates); the SOP's `$geoIntersects` query is the same test done
 * here with ray casting so it works on the existing zone documents without a GeoJSON migration.
 * Every failed check is logged so the admin "expansion demand" report shows where customers are asking for delivery.
 */

const attemptSchema = new mongoose.Schema(
    {
        location: { type: { type: String, enum: ['Point'], default: 'Point' }, coordinates: { type: [Number], required: true } },
        source: { type: String, enum: ['onboarding', 'address_add', 'address_update', 'checkout', 'address_change', 'select'], default: 'address_add', index: true },
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodUser', default: null },
        cityAttempted: { type: String, default: '', trim: true, index: true },
        nearestZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
        nearestZoneName: { type: String, default: '' },
        distanceKm: { type: Number, default: null }
    },
    { collection: 'dmb_zone_validation_attempts', timestamps: { createdAt: true, updatedAt: false } }
);
attemptSchema.index({ createdAt: -1 });
attemptSchema.index({ location: '2dsphere' });
export const DMBZoneValidationAttempt = mongoose.model('DMBZoneValidationAttempt', attemptSchema);

let zoneCache = { at: 0, zones: [] };
export const invalidateZoneCache = () => { zoneCache = { at: 0, zones: [] }; };

const activeZones = async () => {
    if (Date.now() - zoneCache.at < 60_000) return zoneCache.zones;
    const { FoodZone } = await import('../../food/admin/models/zone.model.js');
    const zones = await FoodZone.find({ isActive: true }).select('name zoneName serviceLocation country coordinates').lean();
    zoneCache = { at: Date.now(), zones };
    return zones;
};

export const isPointInPolygon = (lat, lng, polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude, yi = polygon[i].latitude;
        const xj = polygon[j].longitude, yj = polygon[j].latitude;
        const intersect = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

const toRad = (d) => (d * Math.PI) / 180;
export const haversineKm = (lat1, lng1, lat2, lng2) => {
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

/** Distance from a point to the closest polygon vertex/edge midpoint — good enough to suggest the nearest zone. */
const distanceToZone = (lat, lng, zone) => {
    const pts = zone.coordinates || [];
    let best = Infinity;
    for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % pts.length];
        best = Math.min(best, haversineKm(lat, lng, a.latitude, a.longitude), haversineKm(lat, lng, (a.latitude + b.latitude) / 2, (a.longitude + b.longitude) / 2));
    }
    return best;
};

const num = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
};

/** Coordinates from any of the address shapes the apps send. */
export const coordsOf = (address) => {
    if (!address) return null;
    const c = address.location?.coordinates;
    if (Array.isArray(c) && c.length === 2 && num(c[0]) !== null && num(c[1]) !== null) return { lng: num(c[0]), lat: num(c[1]) };
    const lat = num(address.latitude ?? address.lat);
    const lng = num(address.longitude ?? address.lng);
    return lat !== null && lng !== null ? { lat, lng } : null;
};

export const detectZone = async (lat, lng) => {
    for (const zone of await activeZones()) {
        if (isPointInPolygon(lat, lng, zone.coordinates)) return zone;
    }
    return null;
};

export const nearestZone = async (lat, lng) => {
    let best = null;
    for (const zone of await activeZones()) {
        const d = distanceToZone(lat, lng, zone);
        if (!best || d < best.distanceKm) best = { zone, distanceKm: Math.round(d * 10) / 10 };
    }
    return best;
};

/**
 * Checks a point. Returns { inZone, zoneId, zoneName, nearest }. Outside every zone → the attempt is logged (once per
 * call) and `nearest` suggests the closest active zone.
 */
export const validatePoint = async ({ lat, lng, source = 'address_add', userId = null, city = '' }) => {
    if (lat === null || lng === null || lat === undefined || lng === undefined) {
        return { inZone: false, reason: 'NO_COORDINATES' };
    }
    const zone = await detectZone(lat, lng);
    if (zone) return { inZone: true, zoneId: String(zone._id), zoneName: zone.name || zone.zoneName || '' };
    const near = await nearestZone(lat, lng);
    try {
        await DMBZoneValidationAttempt.create({
            location: { type: 'Point', coordinates: [lng, lat] },
            source, userId: userId && mongoose.Types.ObjectId.isValid(String(userId)) ? userId : null,
            cityAttempted: String(city || '').slice(0, 80),
            nearestZoneId: near?.zone?._id || null, nearestZoneName: near?.zone?.name || '', distanceKm: near?.distanceKm ?? null
        });
    } catch { /* logging must not block the customer */ }
    return {
        inZone: false,
        reason: 'OUTSIDE_ZONES',
        nearest: near ? { zoneId: String(near.zone._id), zoneName: near.zone.name || near.zone.zoneName || '', distanceKm: near.distanceKm } : null
    };
};

export class ZoneError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.statusCode = 422;
        this.code = details.reason === 'NO_COORDINATES' ? 'ADDRESS_NO_COORDINATES' : 'ADDRESS_OUTSIDE_ZONE';
        this.details = details;
    }
}

/** Throws a ZoneError the apps can show ("This address is outside our delivery area"). */
export const assertAddressInZone = async (address, { source, userId } = {}) => {
    const c = coordsOf(address);
    const res = await validatePoint({ lat: c?.lat ?? null, lng: c?.lng ?? null, source, userId, city: address?.city });
    if (!res.inZone) {
        throw new ZoneError(
            res.reason === 'NO_COORDINATES'
                ? 'Pick the address on the map so we can check it is inside our delivery area'
                : 'This address is outside our delivery area',
            res
        );
    }
    return res;
};

/** Admin expansion-demand report (AP-11): where failed checks cluster, by area and over time. */
export const expansionDemandReport = async ({ days = 90, gridKm = 2 } = {}) => {
    const since = new Date(Date.now() - Math.max(1, Math.min(Number(days) || 90, 730)) * 86_400_000);
    const rows = await DMBZoneValidationAttempt.find({ createdAt: { $gte: since } }).select('location cityAttempted source nearestZoneName distanceKm createdAt userId').lean();
    const step = Math.max(0.005, (Number(gridKm) || 2) / 111);
    const cells = new Map();
    for (const r of rows) {
        const [lng, lat] = r.location.coordinates;
        const key = `${Math.round(lat / step) * step}|${Math.round(lng / step) * step}`;
        const cell = cells.get(key) || { lat: Math.round(lat / step) * step, lng: Math.round(lng / step) * step, attempts: 0, users: new Set(), cities: {}, nearestZone: r.nearestZoneName, distanceKm: r.distanceKm };
        cell.attempts++;
        if (r.userId) cell.users.add(String(r.userId));
        if (r.cityAttempted) cell.cities[r.cityAttempted] = (cell.cities[r.cityAttempted] || 0) + 1;
        cells.set(key, cell);
    }
    const hotspots = [...cells.values()]
        .map((c) => ({ lat: Number(c.lat.toFixed(4)), lng: Number(c.lng.toFixed(4)), attempts: c.attempts, uniqueCustomers: c.users.size, topCity: Object.entries(c.cities).sort((a, b) => b[1] - a[1])[0]?.[0] || '', nearestZone: c.nearestZone, distanceKm: c.distanceKm }))
        .sort((a, b) => b.attempts - a.attempts);
    const bySource = {};
    for (const r of rows) bySource[r.source] = (bySource[r.source] || 0) + 1;
    return { since, total: rows.length, hotspots: hotspots.slice(0, 200), bySource };
};
