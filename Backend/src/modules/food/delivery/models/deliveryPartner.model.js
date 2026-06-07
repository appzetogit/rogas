import mongoose from 'mongoose';

const normalizeRatingValue = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.max(0, Math.min(5, Number(numeric.toFixed(1))));
};

const deliveryPartnerSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            trim: true,
            unique: true
        },
        email: { type: String, trim: true },
        countryCode: {
            type: String,
            default: '+91'
        },
        address: {
            type: String
        },
        city: {
            type: String
        },
        state: {
            type: String
        },
        vehicleType: {
            type: String
        },
        vehicleName: {
            type: String
        },
        vehicleNumber: {
            type: String,
            unique: true,
            sparse: true
        },
        panNumber: {
            type: String
        },
        aadharNumber: {
            type: String
        },
        drivingLicenseNumber: {
            type: String,
            trim: true
        },
        profilePhoto: {
            type: String
        },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        aadharPhoto: {
            type: String
        },
        panPhoto: {
            type: String
        },
        drivingLicensePhoto: {
            type: String
        },
        status: {
            type: String,
            enum: ['pending', 'approved', 'rejected'],
            default: 'pending'
        },
        rejectionReason: { type: String },
        rejectedAt: { type: Date },
        approvedAt: { type: Date },
        bankAccountHolderName: { type: String },
        bankAccountNumber: { type: String },
        bankIfscCode: { type: String },
        bankName: { type: String },
        upiId: { type: String },
        upiQrCode: { type: String },
        availabilityStatus: {
            type: String,
            enum: ['online', 'offline'],
            default: 'offline'
        },
        shiftStartPic: { type: String },
        shiftStartTime: { type: Date },
        shiftStartAddress: { type: String },
        lastLocation: {
            type: { type: String, enum: ['Point'] },
            coordinates: { type: [Number] }
        },
        lastLat: { type: Number },
        lastLng: { type: Number },
        lastLocationAt: { type: Date },
        referralCode: { type: String, index: true },
        referredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodDeliveryPartner',
            default: null,
            index: true
        },
        referralCount: { type: Number, default: 0, min: 0 },
        rating: {
            type: Number,
            default: 0,
            min: 0,
            max: 5,
            set: normalizeRatingValue
        },
        totalRatings: { type: Number, default: 0, min: 0 },

        // ─── DailyMealBox Driver Fields ──────────────────────────────────────
        /** Fleet partner company this driver belongs to */
        fleetPartnerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FleetPartner',
            default: null,
            index: true
        },
        /** Date of birth — EU gig worker age verification (min 18) */
        dob: { type: Date, default: null },
        /** National ID / Passport document */
        nationalIdUrl: { type: String, default: '' },
        /** Driving licence expiry date — auto-suspend on expiry */
        drivingLicenceExpiry: { type: Date, default: null },
        drivingLicenceStatus: {
            type: String,
            enum: ['valid', 'expiring_soon', 'expired', 'not_uploaded'],
            default: 'not_uploaded',
            index: true
        },
        vehicleRegistrationUrl: { type: String, default: '' },
        /** EU IBAN for earnings payouts */
        bankIban: { type: String, default: '' },
        /** COD cash held by driver (collected from customers) */
        cashBalance: { type: Number, default: 0, min: 0 },
        /** Cash limit before driver must report to admin (default 500 PLN) */
        cashLimit: { type: Number, default: 500, min: 0 },
        /** Whether driver is currently online and accepting deliveries */
        isOnline: { type: Boolean, default: false, index: true },
        /** Current active shift */
        currentShift: {
            type: String,
            enum: ['breakfast', 'lunch', 'dinner', 'none'],
            default: 'none'
        },
        /** Assigned delivery zones */
        zoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone' }],
        /** Today's earnings (reset daily) */
        earningsToday: { type: Number, default: 0, min: 0 },
        /** Today's delivery count (reset daily) */
        deliveriesToday: { type: Number, default: 0, min: 0 },
        /** Minimum guarantee per shift (platform tops up if driver earns less) */
        minimumGuarantee: { type: Number, default: 0, min: 0 },
        /** Weekly bonus target (delivery count) */
        bonusTarget: { type: Number, default: null },
        /** Bonus amount when target is reached */
        bonusAmount: { type: Number, default: null },
        /** City assignment */
        city: { type: String, default: '', index: true },
        /** GPS streaming room (Socket.IO) */
        socketRoomId: { type: String, default: '' }
    },
    {
        collection: 'food_delivery_partners',
        timestamps: true
    }
);

// Indices
deliveryPartnerSchema.index({ lastLocation: '2dsphere' });

export const FoodDeliveryPartner = mongoose.model('FoodDeliveryPartner', deliveryPartnerSchema);

