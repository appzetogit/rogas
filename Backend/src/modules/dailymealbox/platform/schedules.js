import { localDateStr, localTimeHHMM, localParts } from '../../../utils/platformTime.js';

/** Once per local day, at or after `hhmm` (catches up later the same day if the server was down at that time). */
export const dailyAt = (hhmm) => ({
    periodKey: (now) => localDateStr(now),
    isDue: (now) => localTimeHHMM(now) >= hhmm
});

/** Once per local month, from day `day` at `hhmm` onwards. */
export const monthlyAt = (day, hhmm) => ({
    periodKey: (now) => localDateStr(now).slice(0, 7),
    isDue: (now) => {
        const p = localParts(now);
        return p.day > day || (p.day === day && localTimeHHMM(now) >= hhmm);
    }
});

/** Every `minutes` minutes (periods aligned to the epoch, so all instances agree). */
export const every = (minutes) => ({
    periodKey: (now) => `${minutes}m:${Math.floor(now.getTime() / (minutes * 60_000))}`
});
