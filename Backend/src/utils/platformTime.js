/**
 * Platform time zone helpers.
 *
 * Slot times ("11:00"), cut-offs ("20:00") and "today" are wall-clock times in the city the platform serves, not UTC
 * and not the server's own zone. Every date-only value in the DailyMealBox collections (deliveryDate, ShiftRecord.date,
 * holiday dates, …) is stored as UTC midnight of the *local* calendar date, so "2026-10-05" is always
 * 2026-10-05T00:00:00.000Z whatever zone the server runs in.
 *
 * PLATFORM_TIMEZONE (IANA name) defaults to Europe/Warsaw, the launch city.
 */

const DEFAULT_TZ = 'Europe/Warsaw';

export const platformTimeZone = () => {
    const tz = process.env.PLATFORM_TIMEZONE || DEFAULT_TZ;
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: tz });
        return tz;
    } catch {
        return DEFAULT_TZ;
    }
};

const partsCache = new Map();
const formatterFor = (tz) => {
    if (!partsCache.has(tz)) {
        partsCache.set(tz, new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
        }));
    }
    return partsCache.get(tz);
};

/** Wall-clock parts of `date` in the platform zone: { year, month (1-12), day, hour, minute, second }. */
export const localParts = (date = new Date(), tz = platformTimeZone()) => {
    const out = {};
    for (const p of formatterFor(tz).formatToParts(new Date(date))) {
        if (p.type !== 'literal') out[p.type] = Number(p.value);
    }
    if (out.hour === 24) out.hour = 0;
    return out;
};

const pad = (n) => String(n).padStart(2, '0');

/** "YYYY-MM-DD" of `date` in the platform zone. */
export const localDateStr = (date = new Date(), tz = platformTimeZone()) => {
    const p = localParts(date, tz);
    return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
};

/** "HH:MM" of `date` in the platform zone. */
export const localTimeHHMM = (date = new Date(), tz = platformTimeZone()) => {
    const p = localParts(date, tz);
    return `${pad(p.hour)}:${pad(p.minute)}`;
};

/** UTC-midnight Date for a "YYYY-MM-DD" string (the storage form of a calendar date). */
export const dateOnlyFromStr = (str) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    if (!m) return null;
    return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};

/** Today's local calendar date, as the UTC-midnight storage Date. */
export const localToday = (now = new Date()) => dateOnlyFromStr(localDateStr(now));

/** Storage Date (UTC midnight) → "YYYY-MM-DD". */
export const storageDateStr = (date) => new Date(date).toISOString().slice(0, 10);

export const addDays = (date, n) => new Date(new Date(date).getTime() + n * 86_400_000);

/** Offset (ms) of the platform zone from UTC at the given instant. */
const offsetAt = (instant, tz) => {
    const p = localParts(instant, tz);
    const asUTC = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return asUTC - Math.floor(instant.getTime() / 1000) * 1000;
};

/**
 * The real instant of a local wall-clock time on a calendar date: zonedInstant('2026-10-05', '11:00') is 09:00Z in
 * Warsaw summer time. Handles DST by re-checking the offset at the candidate instant.
 */
export const zonedInstant = (dateStrOrDate, hhmm = '00:00', tz = platformTimeZone()) => {
    const dateStr = typeof dateStrOrDate === 'string' ? dateStrOrDate.slice(0, 10) : storageDateStr(dateStrOrDate);
    const [y, mo, d] = dateStr.split('-').map(Number);
    const [h, mi] = String(hhmm || '00:00').split(':').map(Number);
    const naive = Date.UTC(y, mo - 1, d, h || 0, mi || 0, 0);
    let guess = new Date(naive - offsetAt(new Date(naive), tz));
    const corrected = new Date(naive - offsetAt(guess, tz));
    if (corrected.getTime() !== guess.getTime()) guess = corrected;
    return guess;
};

/** Day of week (0=Sun … 6=Sat) of a storage date. */
export const storageDow = (date) => new Date(date).getUTCDay();

/** ISO weekday (1=Mon … 7=Sun) from JS day (0=Sun … 6=Sat). */
export const isoDow = (jsDay) => (jsDay === 0 ? 7 : jsDay);
export const jsDowFromIso = (iso) => (Number(iso) === 7 ? 0 : Number(iso));
