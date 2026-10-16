import mongoose from 'mongoose';

/**
 * What a driver earns per delivery. The most specific active row wins:
 *   zone x slot  >  zone only  >  slot only  >  base (no zone, no slot).
 * A row with a city applies to that city's zones only; a row without a city applies everywhere. `hubStopRate` is what a hub
 * drop-off stop pays (a transfer stop, never a full delivery).
 */
const deliveryRateSchema = new mongoose.Schema(
    {
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
        /** '' = every slot. */
        slotKey: { type: String, default: '', trim: true, lowercase: true },
        ratePln: { type: Number, required: true, min: 0, max: 1000 },
        hubStopRate: { type: Number, default: null, min: 0, max: 1000 },
        effectiveFrom: { type: Date, required: true },
        isActive: { type: Boolean, default: true, index: true },
        note: { type: String, default: '', trim: true, maxlength: 200 },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'dmb_delivery_rates', timestamps: true }
);
deliveryRateSchema.index({ cityId: 1, zoneId: 1, slotKey: 1, effectiveFrom: -1 });
export const DMBDeliveryRate = mongoose.model('DMBDeliveryRate', deliveryRateSchema);

/** One row per (bundle, driver): the first confirmed item of a bundle pays the drop, the others pay nothing. */
const bundlePaySchema = new mongoose.Schema(
    { bundleId: { type: String, required: true }, driverId: { type: mongoose.Schema.Types.ObjectId, required: true } },
    { collection: 'dmb_bundle_pays', timestamps: true }
);
bundlePaySchema.index({ bundleId: 1, driverId: 1 }, { unique: true });
export const DMBBundlePay = mongoose.model('DMBBundlePay', bundlePaySchema);

export const PROMOTION_TYPES = ['delivery_count', 'zone_coverage', 'slot_coverage', 'rate_boost', 'hub_bonus'];

/** A driver incentive that stacks on top of the delivery rate. */
const promotionSchema = new mongoose.Schema(
    {
        cityId: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminCity', default: null, index: true },
        name: { type: String, required: true, trim: true, maxlength: 80 },
        type: { type: String, enum: PROMOTION_TYPES, required: true },
        /** null / '' = any zone / any slot. */
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
        slotKey: { type: String, default: '', trim: true, lowercase: true },
        /** Deliveries / days / hub stops to reach (count-based types). */
        targetCount: { type: Number, default: 0, min: 0 },
        /** Paid once when the target is reached (count-based types). */
        bonusPln: { type: Number, default: 0, min: 0 },
        /** rate_boost: added to the rate of every delivery inside the window. */
        rateBoostPln: { type: Number, default: 0, min: 0 },
        validFrom: { type: Date, required: true },
        validUntil: { type: Date, required: true },
        status: { type: String, enum: ['draft', 'active', 'expired'], default: 'draft', index: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'dmb_driver_promotions', timestamps: true }
);
export const DMBDriverPromotion = mongoose.model('DMBDriverPromotion', promotionSchema);

/** One bonus paid to one driver for one promotion and period: the unique index makes every bonus exactly-once. */
const awardSchema = new mongoose.Schema(
    {
        promotionId: { type: mongoose.Schema.Types.ObjectId, ref: 'DMBDriverPromotion', required: true },
        driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },
        /** 'week:YYYY-MM-DD' (Monday) or 'day:YYYY-MM-DD'. */
        periodKey: { type: String, required: true },
        amount: { type: Number, required: true, min: 0 },
        /** The delivery the bonus was added to (so every earnings report that sums deliveries includes it). */
        unitKind: { type: String, enum: ['meal', 'pantry', 'hub'], default: 'meal' },
        unitId: { type: mongoose.Schema.Types.ObjectId, default: null }
    },
    { collection: 'dmb_promotion_awards', timestamps: true }
);
awardSchema.index({ promotionId: 1, driverId: 1, periodKey: 1 }, { unique: true });
export const DMBPromotionAward = mongoose.model('DMBPromotionAward', awardSchema);
