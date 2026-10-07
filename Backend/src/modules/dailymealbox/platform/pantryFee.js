import mongoose from 'mongoose';

/**
 * Pantry delivery fee (admin: Pantry Delivery Fee). What the customer pays for each bag delivery, i.e. for every
 * delivery day and slot of a pantry order. Separate from the driver's per-order pay and from the meal delivery fee.
 * Nothing is built in: until the admin sets it, pantry deliveries are free for the customer.
 */
const pantryFeeSchema = new mongoose.Schema(
    {
        deliveryFeePerDelivery: { type: Number, default: 0, min: 0 },
        isActive: { type: Boolean, default: true },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'dmb_pantry_fee_settings', timestamps: true }
);

export const PantryFeeSettings = mongoose.models.PantryFeeSettings || mongoose.model('PantryFeeSettings', pantryFeeSchema);

export const getPantryDeliveryFee = async () => {
    const doc = await PantryFeeSettings.findOne({ isActive: true }).lean();
    const fee = Number(doc?.deliveryFeePerDelivery);
    return Number.isFinite(fee) && fee > 0 ? Math.round(fee * 100) / 100 : 0;
};

export const setPantryDeliveryFee = async (value, adminId = null) => {
    const fee = Number(value);
    if (!Number.isFinite(fee) || fee < 0 || fee > 10000) throw new Error('Fee must be between 0 and 10000');
    return PantryFeeSettings.findOneAndUpdate(
        { isActive: true },
        { $set: { deliveryFeePerDelivery: Math.round(fee * 100) / 100, updatedBy: adminId } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();
};
