/**
 * Country and currency helpers.
 *
 * The country of the customer's zone decides which payment provider is offered and which currency is charged.
 * Zones store the country as free text ("Poland", "poland", "PL"), phone numbers carry a dial code ("+48"), so both are
 * normalised to an ISO 3166-1 alpha-2 code here.
 */

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

const NAME_TO_CODE = (() => {
    const map = new Map();
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    for (const a of letters) {
        for (const b of letters) {
            const code = `${a}${b}`;
            let name;
            try {
                name = regionNames.of(code);
            } catch {
                continue;
            }
            if (name && name !== code && !/unknown region/i.test(name)) map.set(name.toLowerCase(), code);
        }
    }
    const aliases = {
        uk: 'GB', 'united kingdom': 'GB', 'great britain': 'GB', england: 'GB',
        usa: 'US', 'united states of america': 'US', america: 'US',
        holland: 'NL', 'the netherlands': 'NL',
        czechia: 'CZ', 'czech republic': 'CZ',
        deutschland: 'DE', polska: 'PL', 'republic of india': 'IN', bharat: 'IN',
        ukraina: 'UA'
    };
    for (const [k, v] of Object.entries(aliases)) map.set(k, v);
    return map;
})();

/** "Poland" | "poland" | "pl" | "PL" -> "PL"; unknown -> null. */
export const normalizeCountry = (value) => {
    const v = String(value || '').trim();
    if (!v) return null;
    if (/^[A-Za-z]{2}$/.test(v)) {
        const up = v.toUpperCase();
        return up === 'UK' ? 'GB' : up;
    }
    return NAME_TO_CODE.get(v.toLowerCase()) || null;
};

const DIAL_TO_COUNTRY = {
    '+48': 'PL', '+91': 'IN', '+49': 'DE', '+33': 'FR', '+34': 'ES', '+39': 'IT', '+31': 'NL', '+32': 'BE', '+43': 'AT',
    '+353': 'IE', '+351': 'PT', '+358': 'FI', '+30': 'GR', '+421': 'SK', '+386': 'SI', '+372': 'EE', '+371': 'LV',
    '+370': 'LT', '+352': 'LU', '+356': 'MT', '+357': 'CY', '+385': 'HR', '+420': 'CZ', '+36': 'HU', '+40': 'RO',
    '+359': 'BG', '+46': 'SE', '+45': 'DK', '+44': 'GB', '+380': 'UA', '+1': 'US'
};

/** "+48" | "48" | "0048" -> "PL". */
export const countryFromDialCode = (dial) => {
    let d = String(dial || '').trim();
    if (!d) return null;
    d = d.replace(/^00/, '+');
    if (!d.startsWith('+')) d = `+${d}`;
    return DIAL_TO_COUNTRY[d] || null;
};

const EUR_COUNTRIES = ['AT', 'BE', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK'];
const COUNTRY_CURRENCY = {
    PL: 'PLN', IN: 'INR', CZ: 'CZK', HU: 'HUF', RO: 'RON', BG: 'BGN', SE: 'SEK', DK: 'DKK', GB: 'GBP', US: 'USD', UA: 'UAH',
    ...Object.fromEntries(EUR_COUNTRIES.map((c) => [c, 'EUR']))
};

/** Default currency of a country when the admin has not configured a city with its own currency. */
export const defaultCurrencyFor = (country, fallback = 'EUR') => COUNTRY_CURRENCY[country] || fallback;

/** How many decimals a currency has (PLN/EUR/INR: 2, HUF/JPY: 0 in most APIs, KWD: 3). */
export const minorDigits = (currency) => {
    try {
        return new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits;
    } catch {
        return 2;
    }
};

/** 12.34 PLN -> 1234 (integer minor units). Rounds half up on the decimal string, avoiding float drift. */
export const toMinor = (amount, currency) => {
    const digits = minorDigits(currency);
    const n = Number(amount);
    if (!Number.isFinite(n)) return NaN;
    return Math.round(Number((n * 10 ** digits).toFixed(4)));
};

export const fromMinor = (minor, currency) => Number(minor) / 10 ** minorDigits(currency);

export const isValidCurrency = (code) => {
    try {
        new Intl.NumberFormat('en', { style: 'currency', currency: String(code) });
        return /^[A-Za-z]{3}$/.test(String(code));
    } catch {
        return false;
    }
};
