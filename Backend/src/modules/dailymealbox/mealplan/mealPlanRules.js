import { getControl } from '../platform/platformConfig.service.js';
import { activeSpecialisms } from '../vendor/vendorAmendment.service.js';
import { addDays, dateOnlyFromStr, localToday, storageDateStr } from '../../../utils/platformTime.js';

/**
 * Validation of a vendor's meal plan before it is saved (VM-07):
 *   Gap AL  Hot/Cold: required to publish while ACM-183 is on; cold meals need reheating instructions (≤150 chars).
 *   Gap AH  medical plan categories need an approved, unexpired specialism of the same kind.
 *   Gap M   pre-order: a future launch date; the reservation cut-off defaults to the day before launch.
 * Fields only the platform may set (ratings, featured flags, counters) are never taken from the request.
 */

const PROTECTED = ['vendorId', 'rating', 'totalRatings', 'activeSubscriberCount', 'bookedToday', 'isFeatured', 'featuredUntil', 'matchScore', 'launchedAt', '_id', 'createdAt', 'updatedAt'];
const MEDICAL = ['hashimoto', 'pregnancy', 'low_gi', 'menopause'];

export class MealPlanRuleError extends Error {
    constructor(message, code = 'MEAL_INVALID') {
        super(message);
        this.statusCode = 400;
        this.code = code;
    }
}

export const prepareMealPlanInput = async ({ vendor, body = {}, existing = null }) => {
    const input = { ...body };
    for (const f of PROTECTED) delete input[f];
    const next = { ...(existing || {}), ...input };

    // ── Gap AL ─────────────────────────────────────────────────────────────────────────────────────────
    if (input.temperatureType !== undefined) {
        if (input.temperatureType === '' || input.temperatureType === null) input.temperatureType = null;
        else if (!['hot', 'cold'].includes(input.temperatureType)) throw new MealPlanRuleError('Choose how the meal is served: Hot or Cold');
    }
    if (input.reheatInstructions !== undefined) input.reheatInstructions = String(input.reheatInstructions || '').trim();
    if ((next.reheatInstructions || '').length > 150) throw new MealPlanRuleError('Reheating instructions can be at most 150 characters');
    if (next.temperatureType === 'cold' && !String(next.reheatInstructions || '').trim()) {
        throw new MealPlanRuleError('Add reheating instructions for a cold meal (e.g. "Microwave 3 min at 800W")', 'REHEAT_REQUIRED');
    }
    if (next.temperatureType !== 'cold' && input.temperatureType === 'hot') input.reheatInstructions = '';
    const publishing = ['active', 'pre_order'].includes(next.status);
    if (publishing && !next.temperatureType) {
        const mandatory = (await getControl('temperatureMandatory')).enabled;
        if (mandatory) throw new MealPlanRuleError('Choose Hot or Cold before publishing — the meal stays in Draft until you do', 'TEMPERATURE_REQUIRED');
    }

    // ── Gap AH ─────────────────────────────────────────────────────────────────────────────────────────
    if (input.planCategory !== undefined && MEDICAL.includes(input.planCategory)) {
        const held = activeSpecialisms(vendor).map((s) => s.specialism);
        if (!held.includes(input.planCategory)) {
            throw new MealPlanRuleError('Medical plan categories need an approved specialism — apply for it in your profile first', 'SPECIALISM_REQUIRED');
        }
    }

    // ── Gap M ──────────────────────────────────────────────────────────────────────────────────────────
    if (next.status === 'pre_order') {
        const launch = next.launchDate ? dateOnlyFromStr(storageDateStr(next.launchDate)) : null;
        if (!launch || launch <= localToday()) throw new MealPlanRuleError('Set a launch date in the future for a pre-order meal', 'LAUNCH_DATE_REQUIRED');
        input.launchDate = launch;
        const cutoff = next.preorderCutoff ? dateOnlyFromStr(storageDateStr(next.preorderCutoff)) : addDays(launch, -1);
        if (cutoff >= launch) throw new MealPlanRuleError('Pre-orders must close before the launch date');
        input.preorderCutoff = cutoff;
    }
    return input;
};
