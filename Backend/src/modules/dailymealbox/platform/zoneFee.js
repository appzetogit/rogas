import mongoose from 'mongoose';

/**
 * Zone-based delivery pricing (Gap K, ACM-157): a City Manager can give each delivery zone its own customer delivery
 * fee. Applies only while ACM-157 is on for the zone's city; otherwise the platform fee per order is used.
 */
const zoneDeliveryFeeSchema = new mongoose.Schema(
    {
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', required: true, unique: true },
        feePerOrder: { type: Number, required: true, min: 0 },
        isActive: { type: Boolean, default: true },
        note: { type: String, default: '', trim: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'dmb_zone_delivery_fees', timestamps: true }
);

export const DMBZoneDeliveryFee = mongoose.model('DMBZoneDeliveryFee', zoneDeliveryFeeSchema);

/** Platform default fee per delivered order (admin Fee Settings). */
export const platformFeePerOrder = async () => {
    const { DeliveryOrderFeeSettings } = await import('../../food/admin/models/deliveryOrderFeeSettings.model.js');
    const cfg = await DeliveryOrderFeeSettings.findOne({ isActive: true }).lean();
    return Number(cfg?.feePerOrder) || 0;
};

/** Customer delivery fee per order for a zone: the zone override when ACM-157 is on there, else the platform fee. */
export const deliveryFeeForZone = async (zoneId) => {
    const base = await platformFeePerOrder();
    if (!zoneId || !mongoose.Types.ObjectId.isValid(String(zoneId))) return { fee: base, source: 'platform' };
    const { isEnabled } = await import('./platformConfig.service.js');
    if (!(await isEnabled('zoneDeliveryPricing', { zoneId }))) return { fee: base, source: 'platform' };
    const override = await DMBZoneDeliveryFee.findOne({ zoneId, isActive: true }).lean();
    return override ? { fee: Number(override.feePerOrder) || 0, source: 'zone' } : { fee: base, source: 'platform' };
};

export const listZoneFees = async () => {
    const { FoodZone } = await import('../../food/admin/models/zone.model.js');
    const [zones, fees, base] = await Promise.all([
        FoodZone.find({}).select('name zoneName serviceLocation country isActive').sort({ name: 1 }).lean(),
        DMBZoneDeliveryFee.find({}).lean(),
        platformFeePerOrder()
    ]);
    const byZone = new Map(fees.map((f) => [String(f.zoneId), f]));
    return { platformFee: base, zones: zones.map((z) => ({ ...z, override: byZone.get(String(z._id)) || null })) };
};

export const setZoneFee = async ({ zoneId, feePerOrder, isActive = true, note = '' }, adminId) => {
    if (!mongoose.Types.ObjectId.isValid(String(zoneId))) throw new Error('Invalid zone');
    const fee = Number(feePerOrder);
    if (!Number.isFinite(fee) || fee < 0 || fee > 1000) throw new Error('Fee must be between 0 and 1000');
    return DMBZoneDeliveryFee.findOneAndUpdate(
        { zoneId },
        { $set: { feePerOrder: Math.round(fee * 100) / 100, isActive: Boolean(isActive), note: String(note || '').slice(0, 200), updatedBy: adminId || null } },
        { upsert: true, new: true }
    ).lean();
};

export const removeZoneFee = async (zoneId) => {
    await DMBZoneDeliveryFee.deleteOne({ zoneId });
    return { removed: true };
};
