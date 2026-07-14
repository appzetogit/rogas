import mongoose from 'mongoose';

const userAddressSchema = new mongoose.Schema(
    {
        label: {
            type: String,
            enum: ['Home', 'Office', 'Other'],
            default: 'Home',
            index: true
        },
        street: {
            type: String,
            required: true,
            trim: true
        },
        additionalDetails: {
            type: String,
            default: '',
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        zipCode: {
            type: String,
            default: '',
            trim: true
        },
        phone: {
            type: String,
            default: '',
            trim: true
        },
        location: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                // [lng, lat]
                type: [Number],
                default: undefined,
                validate: {
                    validator: (v) =>
                        v === undefined ||
                        (Array.isArray(v) && v.length === 2 && v.every((n) => typeof n === 'number' && Number.isFinite(n))),
                    message: 'location.coordinates must be [lng, lat]'
                }
            }
        },
        isDefault: {
            type: Boolean,
            default: false,
            index: true
        }
    },
    { _id: true, timestamps: true }
);

const userSchema = new mongoose.Schema(
    {
        phone: {
            type: String,
            required: true,
            trim: true
        },
        countryCode: {
            type: String,
            default: '+91'
        },
        name: {
            type: String
        },
        email: {
            type: String
        },
        profileImage: {
            type: String,
            default: ''
        },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        dateOfBirth: {
            type: Date,
            default: null
        },
        anniversary: {
            type: Date,
            default: null
        },
        gender: {
            type: String,
            enum: ['male', 'female', 'other', 'prefer-not-to-say', ''],
            default: ''
        },
        referralCode: {
            type: String
        },
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodUser',
            default: null,
            index: true
        },
        referralCount: {
            type: Number,
            default: 0,
            min: 0
        },
        isVerified: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        role: {
            type: String,
            default: 'USER'
        },
        addresses: {
            type: [userAddressSchema],
            default: []
        },

        // ─── DailyMealBox Subscription Fields ──────────────────────────────
        /** Customer onboarding goal — affects plan recommendations */
        onboardingGoal: {
            type: String,
            enum: ['eat_healthy', 'save_time', 'family_meals', 'fitness'],
            default: null
        },
        /** Diet preference — filters plan listings */
        dietType: {
            type: String,
            enum: ['no_preference', 'vegan', 'vegetarian', 'keto'],
            default: 'no_preference'
        },
        /** EU 14 allergens + admin extras */
        allergens: {
            type: [String],
            default: []
        },
        budgetMin: { type: Number, default: null },
        budgetMax: { type: Number, default: null },
        /** Default delivery days preference */
        deliveryDays: {
            type: String,
            enum: ['mon_fri', 'full_week'],
            default: 'mon_fri'
        },
        /** Default delivery slot preference */
        deliverySlot: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner'],
            default: 'lunch'
        },
        /** Invoice type: simple receipt or full B2B VAT invoice */
        invoiceType: {
            type: String,
            enum: ['receipt', 'b2b_vat'],
            default: 'receipt'
        },
        companyNip: { type: String, default: '' },
        companyName: { type: String, default: '' },
        companyAddress: { type: String, default: '' },
        billingEmail: { type: String, default: '' },
        /** Loyalty points balance */
        loyaltyPoints: { type: Number, default: 0, min: 0 },
        /** In-app wallet balance (skip credits etc.) */
        walletBalance: { type: Number, default: 0, min: 0 },
        /** Active city for the user */
        city: { type: String, default: '' },
        /** Current subscription status (denormalized for fast queries) */
        subscriptionStatus: {
            type: String,
            enum: ['active', 'paused', 'cancelled', 'none'],
            default: 'none',
            index: true
        }
    },
    {
        collection: 'food_users',
        timestamps: true
    }
);

userSchema.index({ phone: 1 }, { unique: true });
userSchema.index({ 'addresses.location': '2dsphere' });

export const FoodUser = mongoose.model('FoodUser', userSchema);

