import mongoose from "mongoose";
import { encryptedFields } from '../../../../utils/encryptedFields.plugin.js';

const normalizeRatingValue = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(5, Number(numeric.toFixed(1))));
};

const geoPointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["Point"], default: "Point" },
    coordinates: {
      type: [Number], // [lng, lat]
      default: undefined,
      validate: {
        validator(v) {
          return (
            !v ||
            (Array.isArray(v) &&
              v.length === 2 &&
              v.every((n) => typeof n === "number" && Number.isFinite(n)))
          );
        },
        message: "location.coordinates must be [lng, lat]",
      },
    },
    // Address fields stored alongside geo so UI can consume a single object.
    latitude: { type: Number },
    longitude: { type: Number },
    formattedAddress: { type: String, trim: true },
    address: { type: String, trim: true },
    addressLine1: { type: String, trim: true },
    addressLine2: { type: String, trim: true },
    area: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    landmark: { type: String, trim: true },
  },
  { _id: false },
);

const restaurantSchema = new mongoose.Schema(
  {
    restaurantName: {
      type: String,
      required: true,
      trim: true,
    },
    ownerName: {
      type: String,
      required: true,
      trim: true,
    },
    ownerEmail: {
      type: String,
      trim: true,
    },
    ownerPhone: {
      type: String,
      trim: true,
    },
    // Normalized fields for fast lookup + uniqueness guarantees.
    // These are derived from restaurantName/ownerPhone at write time.
    restaurantNameNormalized: {
      type: String,
      trim: true,
    },
    ownerPhoneDigits: {
      type: String,
      trim: true,
    },
    ownerPhoneLast10: {
      type: String,
      trim: true,
    },
    primaryContactNumber: {
      type: String,
      trim: true,
    },
    pureVegRestaurant: {
      type: Boolean,
      required: true,
      default: false,
    },
    addressLine1: {
      type: String,
    },
    addressLine2: {
      type: String,
    },
    area: {
      type: String,
    },
    city: {
      type: String,
    },
    state: {
      type: String,
    },
    pincode: {
      type: String,
    },
    landmark: {
      type: String,
    },
    cuisines: {
      type: [String],
      default: [],
    },
    openingTime: {
      type: String,
    },
    closingTime: {
      type: String,
    },
    openDays: {
      type: [String],
      default: [],
    } /**
     * Operational toggle controlled by restaurant dashboard.
     * When false, restaurant is shown as offline / not accepting orders even within open hours.
     */,
    isAcceptingOrders: {
      type: Boolean,
      default: true,
      index: true,
    },
    panNumber: {
      type: String,
    },
    nameOnPan: {
      type: String,
    },
    gstRegistered: {
      type: Boolean,
      default: false,
    },
    gstNumber: {
      type: String,
    },
    gstLegalName: {
      type: String,
    },
    gstAddress: {
      type: String,
    },
    fssaiNumber: {
      type: String,
    },
    fssaiExpiry: {
      type: Date,
    },
    accountNumber: {
      type: String,
    },
    ifscCode: {
      type: String,
    },
    accountHolderName: {
      type: String,
    },
    accountType: {
      type: String,
    },
    upiId: {
      type: String,
      trim: true,
    },
    upiQrImage: {
      type: String,
      trim: true,
    },
    menuImages: {
      type: [String],
      default: [],
    },
    menuPdf: {
      type: String,
    },
    coverImages: {
      type: [String],
      default: [],
    },
    profileImage: {
      type: String,
    },
    fcmTokens: {
      type: [String],
      default: [],
    },
    fcmTokenMobile: {
      type: [String],
      default: [],
    },
    /** GeoJSON point used for distance queries. */
    location: {
      type: geoPointSchema,
      default: undefined,
    },
    /** Optional service zone id (can be computed from location). */
    zoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodZone",
      index: true,
    },
    zoneName: {
      type: String,
      default: "",
    },
    pendingZoneId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FoodZone",
      default: null,
    },
    pendingLocation: {
      type: geoPointSchema,
      default: undefined,
    },
    zoneChangeStatus: {
      type: String,
      enum: ["none", "pending", "approved", "rejected"],
      default: "none",
    },
    zoneChangeRejectionReason: {
      type: String,
      default: "",
    },
    businessModel: {
      type: String,
      trim: true,
    },
    panImage: {
      type: String,
    },
    gstImage: {
      type: String,
    },
    fssaiImage: {
      type: String,
    },
    estimatedDeliveryTime: { type: String },
    /** Numeric delivery time in minutes for filtering/sorting. */
    estimatedDeliveryTimeMinutes: { type: Number, index: true },
    featuredDish: { type: String },
    featuredPrice: { type: Number },
    offer: { type: String },
    /** Rating fields for filtering/sorting (defaults to 0 if never rated). */
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
      index: true,
      set: normalizeRatingValue,
    },
    totalRatings: { type: Number, default: 0, min: 0 },
    diningSettings: {
      isEnabled: { type: Boolean, default: false },
      maxGuests: { type: Number, default: 6 },
      diningType: { type: [String], default: ["family-dining"] },
    },
    menu: {
      sections: { type: Array, default: [] },
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    approvedAt: {
      type: Date,
    },
    rejectedAt: {
      type: Date,
    },
    rejectionReason: {
      type: String,
      trim: true,
    },
    pendingUpdateReason: {
      type: String,
      trim: true,
    },
    zoneRank: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
      index: true,
    },

    // ─── DailyMealBox Vendor Fields ──────────────────────────────────────────
    /** Vendor type for DailyMealBox subscription platform */
    vendorType: {
      type: String,
      enum: ['home_cook', 'cloud_kitchen', 'restaurant', 'catering', 'pantry_shop'],
      default: 'restaurant',
      index: true,
    },
    /** Kitchen Partner company (for home cooks without registered company) */
    kitchenPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KitchenPartner',
      default: null,
    },
    /** Assigned Delivery Partner for automated dispatch */
    assignedDeliveryPartnerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'FoodDeliveryPartner',
      default: null,
    },
    /** EU food business licence — mandatory before going live */
    foodLicenceUrl: { type: String, default: '' },
    foodLicenceExpiry: { type: Date, default: null },
    foodLicenceStatus: {
      type: String,
      enum: ['valid', 'expiring_soon', 'expired', 'not_uploaded'],
      default: 'not_uploaded',
      index: true,
    },
    /** VAT registration number (NIP for Poland) */
    vatNumber: { type: String, default: '' },
    /** Bank Account Number */
    accountNumber: { type: String, default: '' },
    /** Owner ID Upload Image URL */
    ownerIdImage: { type: String, default: '' },
    /** Language chosen by the vendor (admin-managed language code). null = default language. */
    languagePreference: { type: String, default: null, trim: true, lowercase: true },
    /** Offered meal slots */
    mealSlots: {
      type: [String],
      default: [],
    },
    /** Platform commission rate (default 15%) */
    commissionRate: { type: Number, default: 0.15, min: 0, max: 1 },
    /** VAT rate for food (per city: Poland=0.08, Germany=0.07, France=0.10) */
    vatRate: { type: Number, min: 0, max: 1 }, // unused legacy; VAT comes from the city config
    /** Vacation mode — pauses all subscriptions temporarily */
    vacationMode: { type: Boolean, default: false, index: true },
    vacationStart: { type: Date, default: null },
    vacationEnd: { type: Date, default: null },
    /** Featured listing in plans browse */
    isFeatured: { type: Boolean, default: false, index: true },
    featuredUntil: { type: Date, default: null },
    /** City (Warsaw / Berlin / Paris) */
    city: { type: String, default: '', index: true },
    /** Active subscription count (denormalized for quick dashboard) */
    activeSubscriberCount: { type: Number, default: 0, min: 0 },
    /** Tomorrow's forecast pushed to vendor */
    forecastPushTime: { type: String, default: '19:00' },

    // ─── Amendment v2 Extra ──────────────────────────────────────────────────
    /** Zones this vendor delivers to (Gap X). Empty = its own zoneId only. */
    deliveryZoneIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone' }],
    /** Weekdays the vendor delivers (JS days 0=Sun…6=Sat). Mon–Fri by default; weekends need ACM-177 (Gap AJ). */
    deliveryWeekdays: { type: [Number], default: [1, 2, 3, 4, 5] },
    /** The vendor may be part of customers' Smart Rotations (Gap AK). */
    rotationAvailable: { type: Boolean, default: true },

    /** Two-track home cook model (Gap AA). 1 = działalność nierejestrowana, 2 = Kitchen Partner / own company. */
    cookTrack: { type: Number, enum: [1, 2, null], default: null, index: true },
    cookTrackChangedAt: { type: Date, default: null },
    track1JoinedAt: { type: Date, default: null },
    /** Own company NIP (Track 2 without a Kitchen Partner). */
    companyNip: { type: String, default: '' },
    kitchenPhotos: {
      type: [{ url: { type: String, required: true }, uploadedAt: { type: Date, default: Date.now }, _id: false }],
      default: undefined,
    },
    kitchenPhotoReview: {
      status: { type: String, enum: ['not_submitted', 'pending', 'approved', 'rejected'], default: 'not_submitted' },
      reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
      reviewedAt: { type: Date, default: null },
      reason: { type: String, default: '' },
    },
    sanepidDocUrl: { type: String, default: '' },
    sanepidUploadedAt: { type: Date, default: null },
    /** Track 1 may trade before the Sanepid document arrives, until this date (ACM-163). */
    sanepidDeadline: { type: Date, default: null },
    /** Set when the Sanepid grace period ran out without the document — the vendor cannot go online. */
    track1Paused: { type: Boolean, default: false },
    /** Threshold warnings already sent per month, e.g. { "2026-10": ["amber"] } (ACM-162). */
    track1Warnings: { type: mongoose.Schema.Types.Mixed, default: undefined },
    trackUpgradeNotice: {
      sentAt: { type: Date, default: null },
      deadline: { type: Date, default: null },
      sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    },

    /** Preferred delivery partner (Gap AD). Linked only by an admin. */
    deliveryPreference: { type: String, enum: ['pool', 'preferred_fleet_partner'], default: 'pool' },
    preferredFleetPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FleetPartner', default: null },

    /** Eco packaging (Gap AI). Badge shows when enabled AND (verified OR ACM-176 verification off). */
    ecoPackaging: {
      enabled: { type: Boolean, default: false },
      type: { type: String, enum: ['biodegradable', 'recyclable', 'paper', 'reusable', ''], default: '' },
      photoUrl: { type: String, default: '' },
      declaredAt: { type: Date, default: null },
      adminVerified: { type: Boolean, default: false },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
      verifiedAt: { type: Date, default: null },
    },

    /** Medical diet specialisms (Gap AH) — each approved separately, expires after ACM-175 months. */
    specialisms: {
      type: [{
        specialism: { type: String, enum: ['hashimoto', 'pregnancy', 'low_gi', 'menopause'], required: true },
        status: { type: String, enum: ['pending', 'approved', 'rejected', 'expired'], default: 'pending' },
        documentUrl: { type: String, default: '' },
        samplePlanUrl: { type: String, default: '' },
        dietitianName: { type: String, default: '' },
        notes: { type: String, default: '' },
        appliedAt: { type: Date, default: Date.now },
        approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
        approvedAt: { type: Date, default: null },
        expiryDate: { type: Date, default: null },
        rejectionReason: { type: String, default: '' },
        reminderSentAt: { type: Date, default: null },
        verificationLevel: { type: String, enum: ['dietitian_certified', 'dailymealbox_verified'], default: 'dietitian_certified' },
      }],
      default: undefined,
    },

    /** Meal-quality rating only (Gap R) — delivery problems never lower it. */
    mealRating: {
      average: { type: Number, default: 0 },
      count: { type: Number, default: 0 },
    },
    /** Review responses (Gap T): responded / total, for the AP-05 response rate. */
    reviewStats: {
      total: { type: Number, default: 0 },
      responded: { type: Number, default: 0 },
    },
  },
  {
    collection: "food_restaurants",
    timestamps: true,
  },
);

restaurantSchema.pre("validate", function normalizeDerivedFields(next) {
  const name =
    typeof this.restaurantName === "string" ? this.restaurantName : "";
  const normalizedName = name.trim().toLowerCase().replace(/\s+/g, " ");
  this.restaurantNameNormalized = normalizedName || undefined;

  const phoneRaw =
    typeof this.ownerPhone === "string" || typeof this.ownerPhone === "number"
      ? String(this.ownerPhone)
      : "";
  const digits = phoneRaw.replace(/\D/g, "").slice(-15); // guard against country prefixes
  this.ownerPhoneDigits = digits || undefined;
  this.ownerPhoneLast10 = digits ? digits.slice(-10) : undefined;

  // Keep `location` in sync when flat address fields exist (backward-compatible migration).
  // Prefer explicit location.* fields if provided.
  const hasAnyFlatAddress =
    this.addressLine1 ||
    this.addressLine2 ||
    this.area ||
    this.city ||
    this.state ||
    this.pincode ||
    this.landmark;
  if (this.location) {
    // If a location object exists but has no usable geo coordinates,
    // keep flat address fields only and drop location to avoid 2dsphere write errors.
    const hasCoordinates =
      Array.isArray(this.location.coordinates) &&
      this.location.coordinates.length === 2 &&
      this.location.coordinates.every(
        (n) => typeof n === "number" && Number.isFinite(n),
      );
    const hasLatLng =
      typeof this.location.latitude === "number" &&
      Number.isFinite(this.location.latitude) &&
      typeof this.location.longitude === "number" &&
      Number.isFinite(this.location.longitude);
    if (!hasCoordinates && !hasLatLng) {
      if (!this.addressLine1 && this.location.addressLine1)
        this.addressLine1 = this.location.addressLine1;
      if (!this.addressLine2 && this.location.addressLine2)
        this.addressLine2 = this.location.addressLine2;
      if (!this.area && this.location.area) this.area = this.location.area;
      if (!this.city && this.location.city) this.city = this.location.city;
      if (!this.state && this.location.state) this.state = this.location.state;
      if (!this.pincode && this.location.pincode)
        this.pincode = this.location.pincode;
      if (!this.landmark && this.location.landmark)
        this.landmark = this.location.landmark;
      this.location = undefined;
    }
  }

  if (this.location) {
    // Sync coords <-> lat/lng
    const lat =
      typeof this.location.latitude === "number"
        ? this.location.latitude
        : undefined;
    const lng =
      typeof this.location.longitude === "number"
        ? this.location.longitude
        : undefined;
    if (
      (!this.location.coordinates || this.location.coordinates.length !== 2) &&
      typeof lng === "number" &&
      typeof lat === "number"
    ) {
      this.location.coordinates = [lng, lat];
    }
    if (
      Array.isArray(this.location.coordinates) &&
      this.location.coordinates.length === 2
    ) {
      const [clng, clat] = this.location.coordinates;
      if (typeof this.location.latitude !== "number" && Number.isFinite(clat))
        this.location.latitude = clat;
      if (typeof this.location.longitude !== "number" && Number.isFinite(clng))
        this.location.longitude = clng;
    }

    // Sync flat -> location for address fields if location fields are empty.
    if (hasAnyFlatAddress) {
      if (!this.location.addressLine1 && this.addressLine1)
        this.location.addressLine1 = this.addressLine1;
      if (!this.location.addressLine2 && this.addressLine2)
        this.location.addressLine2 = this.addressLine2;
      if (!this.location.area && this.area) this.location.area = this.area;
      if (!this.location.city && this.city) this.location.city = this.city;
      if (!this.location.state && this.state) this.location.state = this.state;
      if (!this.location.pincode && this.pincode)
        this.location.pincode = this.pincode;
      if (!this.location.landmark && this.landmark)
        this.location.landmark = this.landmark;
    }
  }

  // Derive estimatedDeliveryTimeMinutes from the human string if not explicitly set.
  // Accepts formats like "25-30 mins", "30 mins", "45".
  if (
    this.estimatedDeliveryTimeMinutes === undefined ||
    this.estimatedDeliveryTimeMinutes === null
  ) {
    const raw =
      typeof this.estimatedDeliveryTime === "string"
        ? this.estimatedDeliveryTime
        : "";
    const match = raw.match(/(\d{1,3})/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      if (Number.isFinite(minutes)) {
        this.estimatedDeliveryTimeMinutes = minutes;
      }
    }
  }
  next();
});

restaurantSchema.index({ ownerPhone: 1 });
restaurantSchema.index({ restaurantName: 1 });
restaurantSchema.index({ restaurantNameNormalized: 1 });

restaurantSchema.index({ "location.city": 1 });
restaurantSchema.index({ location: "2dsphere" });
restaurantSchema.index({ restaurantName: 1, ownerPhone: 1 });
// Enforce uniqueness at the database level to avoid race conditions in registration.
// Uses partial filter to avoid blocking older documents that may not yet have normalized fields.
restaurantSchema.index(
  { restaurantNameNormalized: 1, ownerPhoneLast10: 1 },
  {
    unique: true,
    partialFilterExpression: {
      restaurantNameNormalized: { $type: "string" },
      ownerPhoneLast10: { $type: "string" },
    },
  },
);
restaurantSchema.index({ status: 1, createdAt: -1 });

/** GDPR Art. 32 (Gap N): bank details are encrypted field-by-field (AES-256-GCM). */
restaurantSchema.plugin(encryptedFields, { paths: ['accountNumber'] });

export const FoodRestaurant = mongoose.model(
  "FoodRestaurant",
  restaurantSchema,
);
