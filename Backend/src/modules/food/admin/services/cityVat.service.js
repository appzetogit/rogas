import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { AdminCity } from '../models/adminCity.model.js';

export const CITY_VAT_KEYS = ['foodRestaurant', 'foodBasic', 'delivery', 'service', 'tips'];

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Finds the AdminCity for a zone id and/or a city name. Zone wins, name is matched case-insensitively. */
export async function findCityFor({ zoneId, cityName } = {}) {
    if (zoneId && mongoose.Types.ObjectId.isValid(String(zoneId))) {
        const byZone = await AdminCity.findOne({ zoneIds: zoneId }).lean();
        if (byZone) return byZone;
    }
    const name = String(cityName || '').trim();
    if (name) {
        return AdminCity.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }).lean();
    }
    return null;
}

/**
 * VAT percentages configured for a city (e.g. { foodRestaurant: 8, delivery: 23, ... }).
 * Throws when the city can't be resolved or a requested rate was never set — there is deliberately no default,
 * so a missing configuration is fixed in Admin → City Management instead of producing a wrong tax figure.
 */
export async function getCityVatRates({ zoneId, cityName } = {}, requiredKeys = CITY_VAT_KEYS) {
    const city = await findCityFor({ zoneId, cityName });
    if (!city) {
        throw new ValidationError('No city is configured for this record. Add the city (and its zones) in Admin → City Management.');
    }
    const vat = city.vat || {};
    const missing = requiredKeys.filter((k) => vat[k] === null || vat[k] === undefined || !Number.isFinite(Number(vat[k])));
    if (missing.length) {
        throw new ValidationError(`VAT rate not set for ${city.name}: ${missing.join(', ')}. Set it in Admin → City Management.`);
    }
    return { cityId: city._id, cityName: city.name, rates: Object.fromEntries(CITY_VAT_KEYS.map((k) => [k, vat[k] == null ? null : Number(vat[k])])) };
}

/** Parses the `vat` object from an admin request body; blank/null clears a rate. */
export function parseVatBody(vat) {
    if (vat === undefined) return undefined;
    const out = {};
    for (const key of CITY_VAT_KEYS) {
        const raw = vat?.[key];
        if (raw === '' || raw === null || raw === undefined) { out[key] = null; continue; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0 || n > 100) throw new ValidationError(`VAT rate "${key}" must be between 0 and 100`);
        out[key] = n;
    }
    return out;
}
