import mongoose from 'mongoose';
import { encryptedFields, encryptedSubFields } from '../../utils/encryptedFields.plugin.js';

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
        },
        /** Free-text name for "Other" addresses ("Mum's", "Gym") — up to 3 of them (Gap V). */
        customLabel: { type: String, default: '', trim: true },
        /** Delivery zone the address falls in, checked when saved (Gap U). */
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null }
    },
    { _id: true, timestamps: true }
);

/** GDPR Art. 32 (Gap N): address details are encrypted field-by-field (AES-256-GCM). */
export const USER_ENCRYPTED_ADDRESS_FIELDS = ['street', 'additionalDetails', 'zipCode', 'phone'];
encryptedSubFields(userAddressSchema, { paths: USER_ENCRYPTED_ADDRESS_FIELDS });

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
        /** GDPR deletion tombstone (Amendment 1 #17): no personal data left, the id stays so orders keep working. */
        isDeleted: { type: Boolean, default: false },
        deletedAt: { type: Date, default: null },
        anonId: { type: String, default: '' },
        isActive: {
            type: Boolean,
            default: true,
            index: true
        },
        /** Language chosen by the account holder (code from the admin-managed language list). null = use the default. */
        languagePreference: {
            type: String,
            default: null,
            trim: true,
            lowercase: true
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
        registeredAddress: { type: String, default: '' },
        deliveryAddress: { type: String, default: '' },
        billingEmail: { type: String, default: '' },
        /** Loyalty points balance */
        loyaltyPoints: { type: Number, default: 0, min: 0 },
        /** In-app wallet balance (skip credits etc.) */
        walletBalance: { type: Number, default: 0, min: 0 },
        /** Active city for the user */
        city: { type: String, default: '' },
        /** B2B Company ID for Employees */
        companyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'OfficeCompany',
            default: null,
            index: true
        },
        // ─── Amendment v2 Extra ────────────────────────────────────────────
        /** Per-category notification switches (Gap W); see dailymealbox/notifications/preferences.js. */
        notificationPreferences: { type: mongoose.Schema.Types.Mixed, default: undefined },
        /** GDPR: marketing email consent (Gap I) — default off; only `granted` customers are synced to Mailchimp. */
        marketingEmailConsent: {
            granted: { type: Boolean, default: false },
            at: { type: Date, default: null },
            source: { type: String, default: '' },
            withdrawnAt: { type: Date, default: null }
        },
        /** WhatsApp invoice delivery (Gap J). The number is stored encrypted (Gap N). */
        whatsappNumber: { type: String, default: '' },
        invoiceDeliveryMethod: { type: String, enum: ['email', 'whatsapp', 'both'], default: 'email' },
        /** Eco-packaging preference (Gap AI) — ranks eco vendors higher, never filters. */
        ecoPreference: { type: Boolean, default: false },
        /** Bad-debt flags set by the daily check or Customer Service (Gap F). */
        badDebt: {
            flagged: { type: Boolean, default: false, index: true },
            reasons: { type: [String], default: undefined },
            paymentFailures90d: { type: Number, default: 0 },
            refundRequests60d: { type: Number, default: 0 },
            chargebacks: { type: Number, default: 0 },
            chargebackAmount: { type: Number, default: 0 },
            debtAmount: { type: Number, default: 0 },
            codBlocked: { type: Boolean, default: false },
            subscriptionBlocked: { type: Boolean, default: false },
            escalated: { type: Boolean, default: false },
            flaggedBy: { type: String, default: '' },
            flaggedAt: { type: Date, default: null },
            lastCheckedAt: { type: Date, default: null },
            notes: {
                type: [{ text: String, by: String, at: { type: Date, default: Date.now }, _id: false }],
                default: undefined
            }
        },
        /** Customer segments (Gap Y). */
        segmentIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'DMBCustomerSegment', default: undefined, index: true },

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

userSchema.plugin(encryptedFields, { paths: [], nested: USER_ENCRYPTED_ADDRESS_FIELDS.map((f) => `addresses.${f}`) });

export const FoodUser = mongoose.model('FoodUser', userSchema);

