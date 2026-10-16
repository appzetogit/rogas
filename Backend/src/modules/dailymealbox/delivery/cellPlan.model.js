import mongoose from 'mongoose';

/**
 * Marks that a zone x slot x date has been locked: from then on its orders are split between the drivers who accepted
 * (the split itself lives on the orders as dispatch.deliveryPartnerId / the pantry bag's driverId).
 */
const cellPlanSchema = new mongoose.Schema(
    {
        date: { type: Date, required: true },
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', required: true },
        slotKey: { type: String, required: true, trim: true, lowercase: true },
        lockedAt: { type: Date, required: true },
        /** How many orders / bags the system placed on drivers when locking, per driver. */
        split: [{ driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner' }, weight: Number, stops: Number }]
    },
    { collection: 'dmb_cell_plans', timestamps: true }
);
cellPlanSchema.index({ date: 1, zoneId: 1, slotKey: 1 }, { unique: true });

export const DMBCellPlan = mongoose.model('DMBCellPlan', cellPlanSchema);
