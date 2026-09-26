import mongoose from 'mongoose';
import { PaymentSettings } from './payments.models.js';
import { getProvider, SWITCHABLE_PROVIDERS } from './providers/index.js';
import { paymentsMode } from './payments.config.js';
import { normalizeCountry, defaultCurrencyFor, countryFromDialCode, isValidCurrency } from './payments.locale.js';

export class PaymentsError extends Error {
    constructor(message, statusCode = 400, code = 'PAYMENT_ERROR') {
        super(message);
        this.name = 'PaymentsError';
        this.statusCode = statusCode;
        this.code = code;
    }
}

// ─── Settings (admin switches) ───────────────────────────────────────────────

const SETTINGS_TTL_MS = 10_000;
let settingsCache = { at: 0, value: null };
export const invalidateSettingsCache = () => {
    settingsCache = { at: 0, value: null };
};

export const getSettings = async () => {
    if (settingsCache.value && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
    let doc = await PaymentSettings.findById('default').lean();
    if (!doc) {
        await PaymentSettings.updateOne({ _id: 'default' }, { $setOnInsert: {} }, { upsert: true });
        doc = await PaymentSettings.findById('default').lean();
    }
    settingsCache = { at: Date.now(), value: doc };
    return doc;
};

/** Live status of every switchable provider: the admin's switch plus whether the server has credentials for it. */
export const getProviderStatuses = async () => {
    const settings = await getSettings();
    return SWITCHABLE_PROVIDERS.map((id) => {
        const provider = getProvider(id);
        const configured = provider.isConfigured();
        const enabled = Boolean(settings.providers?.[id]?.enabled);
        return { id, label: provider.label, enabled, configured, mode: configured ? provider.mode() : null, available: enabled && configured };
    });
};

const providerIsUsable = (settings, id, currency) => {
    const provider = getProvider(id);
    return Boolean(settings.providers?.[id]?.enabled) && provider.isConfigured() && provider.supportsCurrency(currency);
};

/**
 * Which providers a customer in `country` paying in `currency` is offered, in the admin's order.
 * A country's own rule wins; when none of its providers is usable the "*" (other countries) rule is used instead so a
 * customer is never stranded just because one provider is switched off.
 */
export const resolveProviders = async ({ country, currency }) => {
    const settings = await getSettings();
    const rules = settings.countryRules || [];
    const own = rules.find((r) => r.country === country);
    const fallback = rules.find((r) => r.country === '*');
    const pick = (rule) => (rule?.providers || []).filter((id) => SWITCHABLE_PROVIDERS.includes(id) && providerIsUsable(settings, id, currency));
    let ids = pick(own);
    if (!ids.length) ids = pick(fallback);
    if (paymentsMode() === 'mock') ids = [...ids, 'mock'];
    return ids;
};

// ─── Country / currency of a payment ─────────────────────────────────────────

let cityCache = { at: 0, cities: [] };
const loadCities = async () => {
    if (Date.now() - cityCache.at < 60_000) return cityCache.cities;
    try {
        const { AdminCity } = await import('../food/admin/models/adminCity.model.js');
        cityCache = { at: Date.now(), cities: await AdminCity.find({}).select('country currency').lean() };
    } catch {
        cityCache = { at: Date.now(), cities: [] };
    }
    return cityCache.cities;
};
export const invalidateCityCache = () => {
    cityCache = { at: 0, cities: [] };
};

const currencyFor = async (country) => {
    const cities = await loadCities();
    const city = cities.find((c) => normalizeCountry(c.country) === country && isValidCurrency(c.currency));
    const cityCurrency = city ? String(city.currency).toUpperCase() : null;
    // AdminCity.currency defaults to INR for every city; that default is meaningless outside India.
    if (cityCurrency && !(cityCurrency === 'INR' && country !== 'IN')) return cityCurrency;
    return defaultCurrencyFor(country);
};

/**
 * Works out where a payment happens. Order of evidence: an explicit country, the zone the customer picked,
 * the phone dial code, then the platform default country from the admin settings.
 */
export const resolvePaymentContext = async ({ zoneId, country, dialCode } = {}) => {
    let resolved = normalizeCountry(country);
    if (!resolved && zoneId && mongoose.Types.ObjectId.isValid(String(zoneId))) {
        try {
            const { FoodZone } = await import('../food/admin/models/zone.model.js');
            const zone = await FoodZone.findById(zoneId).select('country').lean();
            resolved = normalizeCountry(zone?.country);
        } catch {
            /* fall through to the next signal */
        }
    }
    if (!resolved) resolved = countryFromDialCode(dialCode);
    if (!resolved) resolved = normalizeCountry((await getSettings()).defaultCountry) || 'PL';
    return { country: resolved, currency: await currencyFor(resolved) };
};

// ─── Admin updates ───────────────────────────────────────────────────────────

export const validateSettingsPatch = async (patch = {}) => {
    const errors = [];
    const current = await getSettings();
    const next = { providers: {}, countryRules: null, defaultCountry: null };

    if (patch.providers) {
        for (const [id, value] of Object.entries(patch.providers)) {
            if (!SWITCHABLE_PROVIDERS.includes(id)) {
                errors.push(`Unknown provider "${id}"`);
                continue;
            }
            if (typeof value?.enabled !== 'boolean') continue;
            if (value.enabled && !current.providers?.[id]?.enabled && !getProvider(id).isConfigured()) {
                errors.push(`${getProvider(id).label} cannot be switched on: its credentials are missing on the server`);
                continue;
            }
            next.providers[id] = { enabled: value.enabled };
        }
    }

    if (patch.countryRules) {
        if (!Array.isArray(patch.countryRules)) errors.push('countryRules must be a list');
        else {
            const seen = new Set();
            const rules = [];
            for (const raw of patch.countryRules) {
                const country = raw?.country === '*' ? '*' : normalizeCountry(raw?.country);
                if (!country) {
                    errors.push(`Unknown country "${raw?.country}"`);
                    continue;
                }
                if (seen.has(country)) {
                    errors.push(`Country ${country} appears twice`);
                    continue;
                }
                seen.add(country);
                const providers = [...new Set((raw.providers || []).map(String))];
                const bad = providers.filter((p) => !SWITCHABLE_PROVIDERS.includes(p));
                if (bad.length) {
                    errors.push(`Unknown provider(s) ${bad.join(', ')} for ${country}`);
                    continue;
                }
                if (!providers.length) {
                    errors.push(`${country === '*' ? 'Other countries' : country} needs at least one payment provider`);
                    continue;
                }
                if (country !== '*') {
                    const currency = await currencyFor(country);
                    for (const p of providers) {
                        if (!getProvider(p).supportsCurrency(currency)) errors.push(`${getProvider(p).label} cannot charge ${currency}, the currency of ${country}`);
                    }
                }
                rules.push({ country, providers });
            }
            if (!seen.has('*')) errors.push('The "Other countries" rule is required');
            next.countryRules = rules;
        }
    }

    if (patch.defaultCountry !== undefined) {
        const c = normalizeCountry(patch.defaultCountry);
        if (!c) errors.push(`Unknown default country "${patch.defaultCountry}"`);
        else next.defaultCountry = c;
    }
    return { errors, next };
};

export const updateSettings = async (patch, actor = '') => {
    const { errors, next } = await validateSettingsPatch(patch);
    if (errors.length) throw new PaymentsError(errors.join('; '), 400, 'INVALID_SETTINGS');
    const before = await getSettings();
    const set = { updatedBy: String(actor || '') };
    for (const [id, v] of Object.entries(next.providers)) set[`providers.${id}.enabled`] = v.enabled;
    if (next.countryRules) set.countryRules = next.countryRules;
    if (next.defaultCountry) set.defaultCountry = next.defaultCountry;
    await PaymentSettings.updateOne({ _id: 'default' }, { $set: set }, { upsert: true });
    invalidateSettingsCache();
    return { before, after: await getSettings() };
};
