# DailyMealBox — Complete Migration Plan
## Existing Project → PRD v3.0 Final

> **Goal**: Convert the existing Indian food delivery app (restaurant-based, on-demand ordering) into **DailyMealBox** — a subscription-first weekly meal delivery platform with real-time tracking, payment (Przelewy24/BLIK), subscriptions, and push notifications.

---

## 🔴 Critical Architecture Differences

| Existing Project | DailyMealBox PRD |
|---|---|
| On-demand restaurant ordering | **Subscription-first** weekly meal plans |
| Indian food, INR currency | European markets — PLN/EUR, VAT engine |
| Restaurant = delivery | **Vendors NEVER deliver** — fleet partners only |
| Basic OTP delivery proof | PIN + Photo proof, Twilio masked calling |
| No subscription model | Subscriptions, skip/pause/swap/cancel |
| Razorpay | **Przelewy24 / BLIK / Stripe EUR** |
| No kitchen partners | **KitchenPartner** legal entity for home cooks |
| Dining module | ❌ REMOVE — not in PRD |
| Quick Commerce module | ❌ REMOVE — not in PRD |
| Taxi module | ❌ REMOVE — not in PRD |

---

## Open Questions

> [!IMPORTANT]
> **Q1 — Payment Gateway**: Current project uses Razorpay. DailyMealBox needs Przelewy24 (Poland) + Stripe EUR (Germany/France). Should Razorpay code be completely replaced or kept as a fallback for India market?

> [!IMPORTANT]
> **Q2 — Data Migration**: Existing MongoDB collections (food_orders, food_restaurants, food_users) — should we rename them to dailymealbox_ prefix or keep existing names?

> [!IMPORTANT]
> **Q3 — Scope of Frontend Rebuild**: The existing frontend has CustomerApp, Vendor (React/JSX), DeliveryV2 modules. DailyMealBox needs React Native apps for Customer, Vendor, Driver. Should the existing web frontend be converted to Admin Panel only, or also serve as a Customer web app?

> [!WARNING]
> **Q4 — Dining/Quick Commerce/Taxi Modules**: These exist in the codebase. PRD has NO mention of these. They should be removed. Confirm before deletion.

---

## Part 1 — FILES TO DELETE

### Backend — Remove Completely

#### ❌ Non-PRD Modules
| File/Directory | Reason |
|---|---|
| `Backend/src/modules/food/dining/` (entire) | Dining/restaurant booking NOT in PRD |
| `Backend/src/modules/quickCommerce/` (entire) | Not in DailyMealBox PRD |
| `Backend/src/modules/taxi/` (entire) | Not in DailyMealBox PRD |

#### ❌ Scratch/Debug Files (Root level)
| File | Reason |
|---|---|
| `Backend/check-pdf.js` | Debug script |
| `Backend/checkOrders.cjs` | Debug script |
| `Backend/check_categories.js` | Debug script |
| `Backend/check_db.js` | Debug script |
| `Backend/check_dining_doc.js` | Debug script |
| `Backend/check_restaurant.js` | Debug script |
| `Backend/create_admin.js` | Debug script |
| `Backend/deleteOrder.cjs` | Debug script |
| `Backend/get_admins.js` | Debug script |
| `Backend/scratch.js` | Debug script |
| `Backend/scratch_token.js` | Debug script |
| `Backend/sync_dining.js` | Dining-related, remove |
| `Backend/testQuery.cjs` | Debug script |
| `Backend/test_db.js` | Debug script |
| `Backend/LEGACY_CORE_MIGRATION_RUNBOOK.md` | Legacy doc |

#### ❌ Models to Delete (Dining)
| Model | Collection | Reason |
|---|---|---|
| `diningBooking.model.js` | dining_bookings | Not in PRD |
| `diningCategory.model.js` | dining_categories | Not in PRD |
| `diningRequest.model.js` | dining_requests | Not in PRD |
| `diningRestaurant.model.js` | dining_restaurants | Not in PRD |

### Frontend — Remove Completely
| Directory | Reason |
|---|---|
| `Frontend/src/modules/taxi/` | Not in PRD |
| `Frontend/src/modules/quickCommerce/` | Not in PRD |
| `Frontend/src/modules/Food/` (rename/rebuild) | Full rebuild as DailyMealBox Customer App |
| `Frontend/src/modules/Vendor/` (rebuild) | Rebuild as DailyMealBox Vendor App |
| `Frontend/src/modules/DeliveryV2/` (rebuild) | Rebuild as DailyMealBox Driver App |
| `Frontend/modernize.js`, `modernize_v2.js`, `modernize_v3.js`, `modernize_v4.js` | Migration scripts |
| `Frontend/replace_colors.js`, `replace_delivery_colors.js` | Migration scripts |
| `Frontend/strip-ts.js`, `debug.js` | Dev scripts |

---

## Part 2 — SCHEMAS TO DELETE / HEAVILY MODIFY

### MongoDB Schemas — DELETE (not needed)

| Schema/Model | Collection | Replace With |
|---|---|---|
| `diningBooking.model.js` | dining_bookings | ❌ Remove |
| `diningCategory.model.js` | dining_categories | ❌ Remove |
| `diningRestaurant.model.js` | dining_restaurants | ❌ Remove |
| `restaurant.model.js` → rename | food_restaurants | ✅ Keep & migrate to `vendors` concept |
| `food.model.js` (FoodItem) | food_items | ✅ Heavily modify → `MealPlan` schema |
| `category.model.js` (FoodCategory) | food_categories | ✅ Modify → meal type categories |
| `Promocode.js` | promocodes | ✅ Modify → DailyMealBox coupon/flash deals |

### MongoDB Schemas — HEAVILY MODIFY

#### `user.model.js` → Add subscription fields
```js
// ADD to existing FoodUser schema:
onboardingGoal: { type: String, enum: ['eat_healthy','save_time','family_meals','fitness'] }
dietType: { type: String, enum: ['no_preference','vegan','vegetarian','keto'] }
allergens: [{ type: String }]  // EU 14 allergens
budgetMin: { type: Number }
budgetMax: { type: Number }
deliveryDays: { type: String, enum: ['mon_fri','full_week'], default: 'mon_fri' }
deliverySlot: { type: String, enum: ['breakfast','lunch','dinner'], default: 'lunch' }
invoiceType: { type: String, enum: ['receipt','b2b_vat'], default: 'receipt' }
companyNip: { type: String }
companyName: { type: String }
billingEmail: { type: String }
loyaltyPoints: { type: Number, default: 0 }
walletBalance: { type: Number, default: 0 }
city: { type: String }   // Warsaw / Berlin / Paris
countryVatZone: { type: String }
```

#### `restaurant.model.js` → Convert to Vendor model
```js
// RENAME: FoodRestaurant → DMBVendor
// CHANGE collection: food_restaurants → dmb_vendors
// ADD:
vendorType: { type: String, enum: ['home_cook','cloud_kitchen','restaurant','catering'], required: true }
kitchenPartnerId: { type: ObjectId, ref: 'KitchenPartner', default: null }
foodLicenceUrl: { type: String }
foodLicenceExpiry: { type: Date }
foodLicenceStatus: { type: String, enum: ['valid','expiring_soon','expired'] }
vatNumber: { type: String }    // NIP for Poland
commissionRate: { type: Number, default: 0.15 }
vatRate: { type: Number, default: 0.08 }  // per city config
vacationMode: { type: Boolean, default: false }
vacationStart: { type: Date }
vacationEnd: { type: Date }
isFeatured: { type: Boolean, default: false }
featuredUntil: { type: Date }
city: { type: String, required: true }
zoneIds: [{ type: ObjectId, ref: 'DMBZone' }]
// REMOVE:
// - diningSettings (not needed)
// - pureVegRestaurant → replace with vendorType
// - openingTime/closingTime → handled by delivery slots
```

#### `order.model.js` → Major expansion
```js
// RENAME: FoodOrder → DMBDelivery
// ADD:
subscriptionId: { type: ObjectId, ref: 'DMBSubscription' }
mealPlanId: { type: ObjectId, ref: 'DMBMealPlan' }
vendorId: { type: ObjectId, ref: 'DMBVendor' }   // rename restaurantId
deliveryDate: { type: Date }
deliverySlot: { type: String, enum: ['breakfast','lunch','dinner'] }
orderType: { type: String, enum: ['subscription','one_time'], default: 'subscription' }
proofMethod: { type: String, enum: ['pin','photo'] }
proofPhotoUrl: { type: String }
deliveryGps: { lat: Number, lng: Number }
gpsMismatch: { type: Boolean, default: false }
collectionBatchId: { type: String }
collectionPinVerified: { type: Boolean }
fleetPartnerId: { type: ObjectId, ref: 'FleetPartner' }
driverTip: { type: Number, default: 0 }
vatBreakdown: {
  foodNet: Number, foodVatRate: Number, foodVatAmount: Number,
  deliveryNet: Number, deliveryVatRate: Number, deliveryVatAmount: Number,
  isReverseCharge: Boolean
}
// REMOVE:
// - items[] array (meals in DailyMealBox are per-delivery, not cart-based)
// - restaurantId → vendorId
// - dining-related fields
```

#### `deliveryPartner.model.js` → Driver + Fleet
```js
// RENAME: FoodDeliveryPartner → DMBDriver
// ADD:
fleetPartnerId: { type: ObjectId, ref: 'FleetPartner', required: true }
dob: { type: Date }    // age verification, min 18
nationalIdUrl: { type: String }
drivingLicenceExpiry: { type: Date }
vehicleRegistrationUrl: { type: String }
bankIban: { type: String }
cashBalance: { type: Number, default: 0 }    // COD cash held
cashLimit: { type: Number, default: 500 }    // PLN limit
isOnline: { type: Boolean, default: false }
currentShift: { type: String, enum: ['breakfast','lunch','dinner','none'] }
zoneIds: [{ type: ObjectId, ref: 'DMBZone' }]
earningsToday: { type: Number, default: 0 }
deliveriesToday: { type: Number, default: 0 }
minimumGuarantee: { type: Number, default: 60 }
bonusTarget: { type: Number }
bonusAmount: { type: Number }
city: { type: String }
```

---

## Part 3 — NEW SCHEMAS TO CREATE

### 🆕 `subscription.model.js` — CORE NEW SCHEMA
```js
// Collection: dmb_subscriptions
{
  subscriptionId: String,  // DMB-SUB-xxxxx
  userId: ObjectId → DMBUser,
  vendorId: ObjectId → DMBVendor,
  mealPlanId: ObjectId → DMBMealPlan,
  status: enum['active','paused','cancelled','pending_payment'],
  startDate: Date,  // always next Monday
  nextDeliveryDate: Date,
  deliveryDays: enum['mon_fri','full_week'],
  deliverySlot: enum['breakfast','lunch','dinner'],
  deliveryAddress: { ... },
  pricing: {
    basePricePerDay: Number,
    deliveryFeePerDay: Number,
    totalPerWeek: Number,
    currency: String
  },
  vatBreakdown: { foodVatRate, deliveryVatRate, ... },
  paymentMethod: enum['przelewy24','blik','stripe','wallet','cod'],
  skipsUsedThisMonth: { type: Number, default: 0 },
  maxSkipsPerMonth: { type: Number, default: 2 },
  pausedUntil: Date,
  cancelledAt: Date,
  cancellationReason: String,
  invoiceType: enum['receipt','b2b_vat'],
  autoRenew: Boolean,
  billingCycleStart: Date,
  createdAt, updatedAt
}
```

### 🆕 `mealPlan.model.js` — Vendor's meal offering
```js
// Collection: dmb_meal_plans
{
  vendorId: ObjectId → DMBVendor,
  name: String,            // "Weekly Polish Homecook"
  description: String,
  photos: [String],
  pricePerDay: Number,
  city: String,
  zoneIds: [ObjectId],
  availableSlots: [enum: 'breakfast','lunch','dinner'],
  availableDays: [enum: 'mon','tue','wed','thu','fri','sat','sun'],
  nutrition: {
    calories: Number, protein: Number, carbs: Number, fats: Number,
    isProvided: Boolean
  },
  allergens: [String],     // EU 14 allergens
  dietTags: [String],      // vegan, gluten-free, keto
  vatCategory: enum['restaurant_processed','basic_food'],
  vatRate: Number,
  status: enum['active','draft','archived'],
  isFeatured: Boolean,
  featuredUntil: Date,
  isFlashDeal: Boolean,
  flashDealDiscount: Number,
  flashDealEndsAt: Date,
  isSurpriseBox: Boolean,
  surpriseBoxDiscount: Number,
  capacity: Number,       // max portions per day
  kitchenPartnerId: ObjectId → KitchenPartner,
  matchScore: Number,     // AI scoring field
  createdAt, updatedAt
}
```

### 🆕 `dailyMenu.model.js` — Vendor daily upload
```js
// Collection: dmb_daily_menus
{
  vendorId: ObjectId,
  mealPlanId: ObjectId,
  date: Date,
  slot: enum['breakfast','lunch','dinner'],
  dishName: String,
  description: String,
  photo: String,
  nutrition: { calories, protein, carbs, fats },
  portionsAvailable: Number,
  portionsBooked: Number,
  status: enum['draft','published'],
  createdAt, updatedAt
}
```

### 🆕 `kitchenPartner.model.js` — Legal entity for home cooks
```js
// Collection: kitchen_partners
{
  companyName: String,    // "FreshKitchen Partners Sp. z o.o."
  nip: String,
  krs: String,
  bankIban: String,
  status: enum['active','suspended'],
  city: String,
  zoneIds: [String],
  homeCooks: [{
    cookId: ObjectId → DMBVendor,
    cookName: String,
    cookPhone: String,
    contractSignedAt: Date,
    contractUrl: String,
    settlementSplit: Number,   // 0.85 = 85%
    status: enum['active','inactive']
  }],
  managementFeePct: Number,   // 0.15 = 15%
  foodLicenceUrl: String,
  foodLicenceExpiry: Date,
  insuranceUrl: String,
  approvedByAdminId: ObjectId,
  createdAt, updatedAt
}
```

### 🆕 `fleetPartner.model.js` — Fleet company
```js
// Collection: fleet_partners
{
  companyName: String,   // "Evelstar Sp. z o.o."
  nip: String,
  bankIban: String,
  contactName: String,
  contactPhone: String,
  contactEmail: String,
  city: String,
  status: enum['active','suspended'],
  drivers: [ObjectId → DMBDriver],
  deliveryVatRate: Number,    // 0.23 for Poland
  invoices: [{
    invoiceDate: Date,
    amount: Number,
    status: enum['pending','approved','paid'],
    invoiceUrl: String
  }],
  approvedByAdminId: ObjectId,
  createdAt, updatedAt
}
```

### 🆕 `collectionBatch.model.js` — Driver pickup from vendor
```js
// Collection: dmb_collection_batches
{
  batchId: String,           // DMB-BATCH-xxxxx
  vendorId: ObjectId,
  driverId: ObjectId,
  deliveryDate: Date,
  slot: enum['breakfast','lunch','dinner'],
  collectionPin: String,     // 4-digit, stored hashed
  pinExpiry: Date,           // 2h from generation
  pinVerified: Boolean,
  pinAttempts: Number,
  boxCount: Number,
  orders: [ObjectId → DMBDelivery],
  status: enum['pending','driver_assigned','collected','failed'],
  collectedAt: Date,
  createdAt, updatedAt
}
```

### 🆕 `vatInvoice.model.js` — EU compliance
```js
// Collection: dmb_vat_invoices
{
  invoiceNumber: String,     // Sequential, DMB/2026/001
  invoiceType: enum['b2c_receipt','b2b_vat','monthly_consolidated','reverse_charge','credit_note'],
  orderId: ObjectId,
  subscriptionId: ObjectId,
  customerId: ObjectId,
  customerType: enum['b2c','b2b'],
  customerNip: String,
  customerVatNumber: String,
  isReverseCharge: Boolean,
  lines: [{
    description: String,
    netAmount: Number,
    vatRate: Number,
    vatAmount: Number,
    grossAmount: Number,
    vatOwner: enum['vendor','fleet_partner','platform']
  }],
  totalNet: Number,
  totalVat: Number,
  totalGross: Number,
  currency: enum['PLN','EUR'],
  city: String,
  pdfUrl: String,
  sentToEmail: String,
  sentAt: Date,
  createdAt: Date,
  // EU law: store 7 years
}
```

### 🆕 `vendorSettlement.model.js`
```js
// Collection: dmb_vendor_settlements
{
  vendorId: ObjectId,
  kitchenPartnerId: ObjectId,
  period: { start: Date, end: Date },
  ordersCount: Number,
  grossFoodRevenue: Number,
  foodVatRate: Number,
  foodVatAmount: Number,
  platformCommissionGross: Number,
  platformCommissionVat: Number,
  platformCommissionNet: Number,
  vendorNetPayout: Number,
  status: enum['pending','paid'],
  paidAt: Date,
  przelewy24TransactionId: String,
  createdAt, updatedAt
}
```

### 🆕 `subscriptionSkip.model.js`
```js
// Collection: dmb_subscription_skips
{
  subscriptionId: ObjectId,
  userId: ObjectId,
  skippedDate: Date,
  slot: String,
  reason: String,
  walletCreditAmount: Number,
  month: String,   // "2026-06" for monthly count
  createdAt
}
```

### 🆕 `driverRoute.model.js` — VRPTW optimised route
```js
// Collection: dmb_driver_routes
{
  driverId: ObjectId,
  date: Date,
  slot: enum['breakfast','lunch','dinner'],
  status: enum['pending','active','completed'],
  stops: [{
    order: Number,
    type: enum['pickup','delivery'],
    vendorId: ObjectId,     // for pickup stops
    orderId: ObjectId,      // for delivery stops
    address: String,
    lat: Number,
    lng: Number,
    timeWindow: { start: String, end: String },
    estimatedArrival: String,
    status: enum['pending','completed','failed'],
    completedAt: Date
  }],
  totalBoxes: Number,
  totalStops: Number,
  estimatedDuration: Number,
  optimisedAt: Date,
  createdAt, updatedAt
}
```

### 🆕 `notification.model.js` — Push notification log
```js
// Collection: dmb_notifications
{
  recipientId: ObjectId,
  recipientType: enum['customer','vendor','driver','admin'],
  title: String,
  body: String,
  data: Object,
  fcmToken: String,
  channel: enum['fcm','email','sms','in_app'],
  status: enum['sent','failed','pending'],
  canDisable: Boolean,
  adminControlRef: String,  // e.g. 'ACM-27'
  sentAt: Date,
  createdAt
}
```

### 🆕 `featureFlag.model.js` — OTA Remote Config
```js
// Collection: dmb_feature_flags
{
  key: String,              // e.g. 'live_tracking_enabled_warsaw'
  city: String,
  value: Mixed,             // boolean, number, string
  previousValue: Mixed,
  changedBy: ObjectId,
  changedAt: Date,
  scheduledFor: Date,       // future-dated toggles
  rollbackUntil: Date,      // 24h window
  description: String,
  category: enum['ordering','slots','payments','smart','delivery','driver'],
  createdAt, updatedAt
}
```

### 🆕 `fraudFlag.model.js`
```js
// Collection: dmb_fraud_flags
{
  flagType: enum['duplicate_device','card_bin_mismatch','gps_mismatch','high_refund_rate'],
  entityId: ObjectId,
  entityType: enum['customer','driver'],
  details: Object,
  status: enum['open','reviewed','dismissed','escalated'],
  reviewedBy: ObjectId,
  createdAt
}
```

### 🆕 `auditLog.model.js` — 7-year EU retention
```js
// Collection: dmb_audit_logs
{
  adminId: ObjectId,
  adminRole: String,
  action: String,
  section: String,
  previousState: Object,
  newState: Object,
  reason: String,
  ip: String,
  timestamp: Date
}
// TTL: 7 years (EU compliance)
```

---

## Part 4 — BACKEND FILES TO MODIFY

### `Backend/src/config/env.js`
- Add: `PRZELEWY24_MERCHANT_ID`, `PRZELEWY24_CRC`, `STRIPE_SECRET_KEY`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `GOOGLE_DISTANCE_MATRIX_KEY`, `VIES_API_URL`
- Add: `PAYMENT_GATEWAY` env var (przelewy24 / stripe / razorpay)

### `Backend/src/config/socket.js`
- Already exists! Modify to add rooms:
  - `customer_order_{orderId}` — live tracking
  - `driver_{driverId}` — driver location stream
  - `admin_room_{city}` — admin live map
  - `vendor_{vendorId}` — vendor realtime orders

### `Backend/server.js`
- Remove: `expireExpiredOffers`, `syncExpiredFssaiNotifications` (food-specific)
- Add: VRPTW route optimizer cron (10:00am daily per city)
- Add: Tomorrow forecast notification cron (configurable per vendor type)
- Add: Subscription auto-resume cron
- Add: Feature flag scheduler cron

### `Backend/src/core/payments/`
- **MAJOR REWRITE** of `payment.service.js`:
  - Replace Razorpay → Przelewy24 + BLIK + Stripe
  - Add VAT calculation engine (`vat.service.js`)
  - Add VAT invoice generation (`vatInvoice.service.js`)
  - Add VIES validation service

### `Backend/src/core/notifications/firebase.service.js`
- Already exists! Modify to add all notification templates from PRD
- Add FCM payload templates for all 40+ notification types

### `Backend/src/core/auth/auth.service.js`
- Modify to support vendor_type during registration
- Add Kitchen Partner linking flow
- Add Fleet Partner assignment for drivers

---

## Part 5 — NEW BACKEND MODULES TO CREATE

```
Backend/src/modules/dailymealbox/
├── subscription/
│   ├── subscription.model.js
│   ├── subscription.controller.js
│   ├── subscription.service.js
│   ├── subscription.routes.js
│   └── subscription.validator.js
├── mealplan/
│   ├── mealPlan.model.js
│   ├── mealPlan.controller.js
│   ├── mealPlan.service.js
│   ├── mealPlan.routes.js
│   └── mealPlan.validator.js
├── vendor/
│   ├── vendor.model.js (migrate from restaurant)
│   ├── vendor.controller.js
│   ├── vendor.service.js
│   ├── vendor.routes.js
│   ├── kitchenPartner.model.js
│   └── vendorSettlement.service.js
├── driver/
│   ├── driver.model.js (migrate from deliveryPartner)
│   ├── driver.routes.js
│   ├── driver.controller.js
│   ├── driverRoute.service.js     ← VRPTW optimizer
│   ├── driverLocation.service.js  ← GPS streaming
│   └── fleetPartner.model.js
├── delivery/
│   ├── delivery.model.js (migrate from order)
│   ├── delivery.service.js
│   ├── delivery.controller.js
│   ├── collectionBatch.model.js
│   ├── collectionPin.service.js
│   └── proofVerification.service.js
├── payment/
│   ├── przelewy24.service.js
│   ├── stripe.service.js
│   ├── vat.service.js            ← VAT engine
│   ├── vatInvoice.service.js     ← PDF generation
│   ├── vendorSettlement.service.js
│   └── cashSettlement.service.js
├── tracking/
│   ├── tracking.socket.js        ← Socket.IO rooms
│   ├── tracking.service.js
│   └── eta.service.js            ← Google Distance Matrix
├── admin/
│   ├── featureFlag.service.js    ← Firebase Remote Config
│   ├── auditLog.service.js
│   ├── fraudDetection.service.js
│   ├── cityManagement.service.js
│   └── manualOrder.service.js
└── notifications/
    ├── notificationCatalogue.js  ← All 40+ notification templates
    └── scheduledNotifications.js ← CRON-based notifications
```

---

## Part 6 — FRONTEND MODULES TO REBUILD

### CustomerApp (Web — React.js)
```
Frontend/src/modules/CustomerApp/
├── screens/
│   ├── Welcome.jsx            ← CA-01
│   ├── GoalSelection.jsx      ← CA-03
│   ├── DietPreferences.jsx    ← CA-04
│   ├── DeliverySchedule.jsx   ← CA-05
│   ├── SubscriptionCheckout.jsx ← CA-07 (with VAT breakdown)
│   ├── Home.jsx               ← CA-08 (Dashboard + next delivery)
│   ├── PlansBrowse.jsx        ← CA-09
│   ├── SurpriseMealBox.jsx    ← CA-10
│   ├── MealPlanDetail.jsx     ← CA-11
│   ├── Calendar.jsx           ← CA-12 (CRITICAL - skip/pause/swap)
│   ├── Orders.jsx             ← CA-13
│   ├── LiveTracking.jsx       ← CA-14 (Socket.IO map)
│   └── Profile.jsx            ← CA-15
├── components/
│   ├── VATBreakdownTable.jsx
│   ├── AllergenBadges.jsx
│   ├── LoyaltyWidget.jsx
│   ├── DeliveryPINDisplay.jsx
│   └── LiveDriverMap.jsx      ← Socket.IO integration
└── hooks/
    ├── useSubscription.js
    ├── useSocket.js           ← Real-time tracking
    └── useVAT.js
```

### VendorApp (Web — React.js)
```
Frontend/src/modules/VendorApp/
├── screens/
│   ├── VendorHome.jsx         ← VM-03 (Dashboard)
│   ├── OrdersBoard.jsx        ← VM-04
│   ├── PreparationBoard.jsx   ← VM-05 (Mark Ready → PIN → FCM)
│   ├── MenuManagement.jsx     ← VM-06
│   ├── AddMeal.jsx            ← VM-07 (Nutrition + Allergens)
│   ├── FoodForecast.jsx       ← VM-NEW-01
│   ├── IngredientPlanner.jsx  ← VM-NEW-02
│   ├── Earnings.jsx           ← VM-08 (VAT settlement)
│   └── VendorProfile.jsx
└── components/
    ├── CollectionPINDisplay.jsx
    ├── VATSettlementBreakdown.jsx
    └── ForecastCard.jsx
```

### DriverApp (Web — React.js, Dark Theme)
```
Frontend/src/modules/DriverApp/
├── screens/
│   ├── DriverHome.jsx         ← DA-03 (Online/Offline toggle)
│   ├── RouteDisplay.jsx       ← DA-04 (Multi-stop optimised)
│   ├── VendorPickup.jsx       ← DA-05 (Collection PIN entry)
│   ├── CustomerDelivery.jsx   ← DA-06 (PIN/Photo proof)
│   ├── FailedDelivery.jsx     ← DA-07
│   ├── PeakHeatmap.jsx        ← DA-08
│   └── Earnings.jsx           ← DA-09
└── components/
    ├── OnlineToggle.jsx
    ├── StopCard.jsx
    ├── PINEntry.jsx
    ├── PhotoCapture.jsx
    └── CashBalanceCard.jsx
```

### AdminPanel (Web — React.js)
```
Frontend/src/modules/AdminPanel/
├── screens/
│   ├── Dashboard.jsx          ← AP-01
│   ├── LiveOperationsMap.jsx  ← AP-02 (WebSocket all drivers)
│   ├── FeatureToggles.jsx     ← AP-03 (100 toggles)
│   ├── ComplaintInbox.jsx     ← AP-04
│   ├── VendorManagement.jsx   ← AP-05
│   ├── DriverManagement.jsx   ← AP-06 (Fleet Partner column)
│   ├── FinancialManagement.jsx ← AP-07 (VAT reports, batch payout)
│   ├── CityZoneManagement.jsx ← AP-08 (GeoJSON zone drawing)
│   ├── APISettings.jsx        ← AP-09 (Super Admin only)
│   ├── ManualOrderEntry.jsx   ← AP-10
│   ├── Analytics.jsx          ← AP-11
│   └── EnvironmentManagement.jsx ← AP-12
└── components/
    ├── AdminRoleGuard.jsx     ← 7-role permission system
    ├── AuditLogViewer.jsx
    ├── FraudAlertPanel.jsx
    └── ZoneDrawingTool.jsx    ← Google Maps Drawing API
```

---

## Part 7 — REAL-TIME SOCKET ARCHITECTURE

### Socket.IO Rooms & Events
```
Customer connects to: room = `order_tracking_${orderId}`
  - Receives: 'driver_location_update' { lat, lng, eta, distance }
  - Receives: 'order_status_changed' { status, message }
  - Receives: 'arriving_soon' { pin, driverName, eta }

Driver emits to: room = `driver_${driverId}`
  - Emits every 5s: 'location_update' { lat, lng, timestamp }

Admin connects to: room = `admin_${city}`
  - Receives: 'all_driver_locations' every 5s
  - Receives: 'operations_snapshot' on connect
  - Receives: 'order_status_update'

Vendor connects to: room = `vendor_${vendorId}`
  - Receives: 'new_order' (real-time new orders)
  - Receives: 'driver_assigned' { driverName, eta, boxCount }
  - Receives: 'batch_collected' { driverName, time }
```

---

## Part 8 — PAYMENT INTEGRATION

### Przelewy24 (Poland — PLN)
```js
// New: Backend/src/modules/dailymealbox/payment/przelewy24.service.js
// - createTransaction(subscriptionId, amount, currency)
// - verifyNotification(webhookData)
// - BLIK payment flow
// - Refund processing
```

### Stripe EUR (Germany, France)
```js
// New: Backend/src/modules/dailymealbox/payment/stripe.service.js
// - createSubscriptionPaymentIntent
// - handleWebhook
// - processRefund
```

---

## Part 9 — PUSH NOTIFICATIONS (FCM)

### Customer Notifications (10+)
- Order confirmed, Out for delivery, Arriving soon (500m), Delivered, Tomorrow menu, Skip confirmation, Pause confirmation, Subscription renewal, Refund processed, Loyalty points earned

### Vendor Notifications (15+)
- Application approved/rejected, New subscriber, Driver assigned, Batch collected, Flash deal live, Payout processed, Food licence expiry, Skip notification, Cutoff approaching, Tomorrow forecast ready

### Driver Notifications (12+)  
- Application approved, New order assigned, Vendor ready + collection PIN, Route updated, Cash limit reached, Bonus unlocked, Shift reminder, Payout processed, Document expiry, Admin force-offline

---

## Verification Plan

### Automated Tests
```bash
# Backend tests
npm test -- --grep "subscription"
npm test -- --grep "vat-engine"
npm test -- --grep "socket-tracking"

# Build check
cd Frontend && npm run build
```

### Manual Verification
1. Create subscription → verify VAT breakdown on checkout
2. Mark vendor ready → verify PIN generated + driver FCM received
3. Driver go online → verify GPS stream appears on admin map + customer tracking
4. Customer tracking page → verify driver dot moves every 5 seconds
5. Skip delivery → verify wallet credit + vendor notified
6. Issue refund → verify VAT split recorded in settlement

---

## Summary: File Count

| Category | Delete | Modify | Create |
|---|---|---|---|
| Backend Models | 4 (dining) | 5 (user, restaurant, order, driver, zone) | 12 new |
| Backend Services | 3 (dining) | 4 (payment, auth, socket, notifications) | 15+ new |
| Backend Routes | 3 (dining) | 2 (main router, auth) | 8+ new |
| Frontend Modules | 3 (taxi, quickCommerce, dining) | 1 (rebuild Food→Customer) | 4 rebuilt apps |
| Frontend Components | 20+ legacy | 10 modified | 40+ new |
| Config Files | 0 | 3 (env, socket, firebase) | 2 new |
| **Total** | **~30 files** | **~25 files** | **~80+ files** |
