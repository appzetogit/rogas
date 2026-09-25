import mongoose from 'mongoose';

/**
 * DMBMealPlan — Vendor meal plan offering
 * A plan = recurring meal offering from a vendor with nutrition, allergens, pricing
 * PRD Reference: CA-09, CA-11, VM-06, VM-07
 */

const nutritionSchema = new mongoose.Schema(
    {
        calories: { type: Number, default: null },
        protein: { type: Number, default: null },
        carbs: { type: Number, default: null },
        fats: { type: Number, default: null },
        isProvided: { type: Boolean, default: false }
    },
    { _id: false }
);

const mealPlanSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodRestaurant',
            required: true,
            index: true
        },
        /** Plan name e.g. "Weekly Polish Homecook Lunch" */
        name: { type: String, required: true, trim: true },
        description: { type: String, default: '', trim: true },
        photos: { type: [String], default: [] },
        /** Price per delivery day */
        pricePerDay: { type: Number, required: true, min: 0 },
        currency: { type: String, default: 'INR' },

        // ─── Location ──────────────────────────────────────────────────────────
        city: { type: String, required: true, index: true },
        zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone' }],

        // ─── Schedule ─────────────────────────────────────────────────────────
        availableSlots: {
            type: [String],
            default: []
        },
        availableDays: {
            type: [String],
            enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
            default: ['mon', 'tue', 'wed', 'thu', 'fri']
        },
        /** Max portions available per day (capacity cap) */
        capacity: { type: Number, default: 50, min: 1 },
        /** Current booked portions for today (denormalized for perf) */
        bookedToday: { type: Number, default: 0, min: 0 },

        // ─── Nutrition (PRD ACM-44) ───────────────────────────────────────────
        nutrition: { type: nutritionSchema, default: () => ({}) },

        // ─── EU Allergens (PRD ACM-46 — EU Reg 1169/2011) ────────────────────
        /** Cannot remove EU 14. Admin can add extras. */
        allergens: { type: [String], default: [] },

        // ─── Diet Tags ────────────────────────────────────────────────────────
        dietTags: {
            type: [String],
            enum: ['vegan', 'vegetarian', 'keto', 'paleo', 'gluten_free', 'dairy_free', 'halal'],
            default: []
        },

        // ─── VAT (PRD Section 2) ──────────────────────────────────────────────
        vatCategory: {
            type: String,
            enum: ['restaurant_processed', 'basic_food'],
            default: 'restaurant_processed'
        },
        vatRate: { type: Number, default: 0.08 },

        // ─── Status ───────────────────────────────────────────────────────────
        status: {
            type: String,
            enum: ['active', 'draft', 'archived'],
            default: 'draft',
            index: true
        },

        // ─── Featured / Flash Deals (PRD ACM-41/42) ───────────────────────────
        isFeatured: { type: Boolean, default: false, index: true },
        featuredUntil: { type: Date, default: null },
        isFlashDeal: { type: Boolean, default: false, index: true },
        flashDealDiscount: { type: Number, default: 0, min: 0, max: 100 },
        flashDealEndsAt: { type: Date, default: null },

        // ─── Surprise Box (PRD ACM-39) ────────────────────────────────────────
        isSurpriseBox: { type: Boolean, default: false, index: true },
        surpriseBoxDiscount: { type: Number, default: 0, min: 0, max: 60 },
        surpriseBoxEndsAt: { type: Date, default: null },

        // ─── Kitchen Partner (Home Cook) ──────────────────────────────────────
        kitchenPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'KitchenPartner',
            default: null
        },

        // ─── AI Matching Score (PRD CA-09b) ───────────────────────────────────
        /** Rule-based match score (100 = all criteria met) */
        matchScore: { type: Number, default: 0, min: 0, max: 100 },

        // ─── Stats ────────────────────────────────────────────────────────────
        rating: { type: Number, default: 0, min: 0, max: 5 },
        totalRatings: { type: Number, default: 0, min: 0 },
        activeSubscriberCount: { type: Number, default: 0, min: 0 }
    },
    {
        collection: 'dmb_meal_plans',
        timestamps: true
    }
);

// ─── Indexes ───────────────────────────────────────────────────────────────
mealPlanSchema.index({ vendorId: 1, status: 1 });
mealPlanSchema.index({ city: 1, status: 1, pricePerDay: 1 });
mealPlanSchema.index({ isFlashDeal: 1, flashDealEndsAt: 1 });
mealPlanSchema.index({ isSurpriseBox: 1, surpriseBoxEndsAt: 1 });
mealPlanSchema.index({ isFeatured: 1, city: 1 });
mealPlanSchema.index({ dietTags: 1, city: 1, status: 1 });

export const DMBMealPlan = mongoose.model('DMBMealPlan', mealPlanSchema);
