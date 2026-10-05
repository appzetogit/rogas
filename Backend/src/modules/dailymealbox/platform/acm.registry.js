/**
 * Admin Controls Matrix — controls added by Amendment v2 Extra (ACM-131 → ACM-183).
 *
 * The SOP delivers these to native apps through Firebase Remote Config. This platform is a web app (wrapped for
 * mobile), so the equivalent is: the value lives here on the server, the backend enforces it on every request, and
 * the apps re-fetch the public part from GET /api/v1/dmb/config (every 5 minutes and whenever the app regains focus),
 * which keeps the SOP's "applies within 15 minutes, no reinstall" promise.
 *
 * Every control has one or more typed fields. A value can be set platform-wide or, where `perCity` is true, overridden
 * for one AdminCity. `roles` lists the admin roles (besides SUPER_ADMIN, who can change everything) allowed to edit it.
 * `public: false` keeps a control out of the public config feed.
 */

import { ALL_TYPES as NOTIFICATION_TYPES } from '../notifications/preferences.js';

const VENDOR_TYPES = ['home_cook', 'cloud_kitchen', 'restaurant', 'catering'];

const bool = (def) => ({ type: 'boolean', default: def });
const num = (def, min, max, extra = {}) => ({ type: 'number', default: def, min, max, ...extra });

export const ACM_GROUPS = {
    visibility: 'Information visibility (Gap O)',
    slots: 'Delivery slots & days (Gaps A, Q, AJ)',
    plans: 'Plans & billing (Gaps C, D, L, AF, AG)',
    ratings: 'Ratings & reviews (Gaps R, T)',
    driver: 'Driver (Gaps B, Z, AD)',
    vendor: 'Vendor (Gaps AA, AB, AE, AH, AI, AL)',
    rotation: 'Smart Rotation (Gap AK)',
    integrations: 'Integrations (Gaps H, I, J)',
    marketing: 'Marketing & segments (Gap Y)',
    pricing: 'Pricing (Gap K)',
    legal: 'Legal & compliance (Gaps G, AC)'
};

export const ACM_CONTROLS = [
    // ─── Gap O — Information visibility (ACM-131 → ACM-145) ─────────────────────────────────────────────
    { acm: 131, key: 'visCustomerVat', group: 'visibility', audience: 'customer', item: 'VAT breakdown (B2C)', label: 'Customer sees food/delivery VAT lines on B2C checkout & receipts', fields: { enabled: bool(true) }, roles: [] },
    { acm: 132, key: 'visCustomerFees', group: 'visibility', audience: 'customer', item: 'Delivery & platform fee lines', label: 'Customer sees delivery fee and platform fee as separate lines', fields: { enabled: bool(true) }, roles: [] },
    { acm: 133, key: 'visCustomerVendorName', group: 'visibility', audience: 'customer', item: 'Vendor name on receipt', label: 'Vendor (maker) name printed on customer receipts', fields: { enabled: bool(true) }, roles: [] },
    { acm: 134, key: 'visCustomerDriverIdentity', group: 'visibility', audience: 'customer', item: 'Driver name & photo', label: 'Customer sees the driver\'s first name and photo while tracking', fields: { enabled: bool(true) }, roles: [] },
    { acm: 135, key: 'visCustomerDriverPhone', group: 'visibility', audience: 'customer', item: 'Driver phone number', label: 'Customer can see/call the driver\'s phone number', fields: { enabled: bool(false) }, roles: [] },
    { acm: 136, key: 'visVendorCustomerName', group: 'visibility', audience: 'vendor', item: 'Customer full name', label: 'Vendor sees the customer\'s full name (otherwise "Anna K.")', fields: { enabled: bool(false) }, roles: [] },
    { acm: 137, key: 'visVendorCustomerPhone', group: 'visibility', audience: 'vendor', item: 'Customer phone number', label: 'Vendor sees the customer\'s phone number', fields: { enabled: bool(false) }, roles: [] },
    { acm: 138, key: 'visVendorCustomerAddress', group: 'visibility', audience: 'vendor', item: 'Customer delivery address', label: 'Vendor sees the customer\'s delivery address', fields: { enabled: bool(false) }, roles: [] },
    { acm: 139, key: 'visVendorCommission', group: 'visibility', audience: 'vendor', item: 'Commission breakdown', label: 'Vendor sees the platform commission deducted per order', fields: { enabled: bool(true) }, roles: [] },
    { acm: 140, key: 'visVendorCustomerPaid', group: 'visibility', audience: 'vendor', item: 'Price the customer paid', label: 'Vendor sees the full price the customer paid (incl. delivery & fees)', fields: { enabled: bool(false) }, roles: [] },
    { acm: 141, key: 'visDriverCustomerName', group: 'visibility', audience: 'driver', item: 'Customer full name', label: 'Driver sees the customer\'s full name (otherwise "Anna K.")', fields: { enabled: bool(false) }, roles: [] },
    { acm: 142, key: 'visDriverCustomerPhone', group: 'visibility', audience: 'driver', item: 'Customer phone number', label: 'Driver sees the customer\'s phone number', fields: { enabled: bool(true) }, roles: [] },
    { acm: 143, key: 'visDriverOrderValue', group: 'visibility', audience: 'driver', item: 'Order value', label: 'Driver sees the order value', fields: { enabled: bool(false) }, roles: [] },
    { acm: 144, key: 'visDriverEarningsBreakdown', group: 'visibility', audience: 'driver', item: 'Earnings breakdown', label: 'Driver sees base / distance / tip breakdown per delivery', fields: { enabled: bool(true) }, roles: [] },
    { acm: 145, key: 'visFleetDriverEarnings', group: 'visibility', audience: 'fleet', item: 'Driver earnings detail', label: 'Fleet partner sees each of its drivers\' earnings detail', fields: { enabled: bool(true) }, roles: [] },

    // ─── Gap A / Q — slots & days ─────────────────────────────────────────────────────────────────────────
    { acm: 146, key: 'customDaySelection', group: 'slots', label: 'Customers can pick specific delivery days (e.g. Mon/Wed/Fri)', fields: { enabled: bool(false) }, perCity: true, roles: [] },
    { acm: 147, key: 'perDaySlots', group: 'slots', label: 'Customers can choose a different slot for each delivery day', fields: { enabled: bool(false) }, perCity: true, roles: [] },
    { acm: 148, key: 'maxSlotsPerDay', group: 'slots', label: 'Maximum delivery slots a customer can subscribe to per day', fields: { value: num(1, 1, 6) }, perCity: true, roles: [] },

    // ─── Gaps C, D, L ─────────────────────────────────────────────────────────────────────────────────────
    { acm: 149, key: 'annualPlan', group: 'plans', label: 'Annual (12-month, paid upfront) plan at checkout', fields: { enabled: bool(false), discountPct: num(16.67, 0, 50, { step: 0.01, hint: '16.67% ≈ 2 months free' }) }, perCity: true, roles: [] },
    { acm: 150, key: 'trialOffer', group: 'plans', label: 'Discounted first week for new customers', fields: { enabled: bool(false), discountPct: num(50, 1, 100), minOrderAmount: num(0, 0, 100000, { hint: 'Minimum first-week total before the trial discount applies' }) }, perCity: true, roles: ['MARKETING_MANAGER'] },
    { acm: 151, key: 'fortnightlyPlan', group: 'plans', label: 'Fortnightly option (deliveries every other week, billed every 2 weeks)', fields: { enabled: bool(false) }, perCity: true, roles: [] },

    // ─── Gaps B / Z ───────────────────────────────────────────────────────────────────────────────────────
    { acm: 152, key: 'driverShiftConfirmation', group: 'driver', label: 'Drivers must confirm each shift 24h ahead (alert if unconfirmed 2h before)', fields: { enabled: bool(false) }, perCity: true, roles: ['CITY_MANAGER'] },

    // ─── Gap G ────────────────────────────────────────────────────────────────────────────────────────────
    { acm: 153, key: 'holidayAutoImport', group: 'legal', label: 'Offer the yearly import of Polish public holidays (admin confirms each date)', fields: { enabled: bool(true) }, roles: [] },

    // ─── Gaps H, I, J ─────────────────────────────────────────────────────────────────────────────────────
    { acm: 154, key: 'googleAnalytics', group: 'integrations', label: 'Google Analytics 4 on the customer web app (after analytics-cookie consent)', fields: { enabled: bool(false), measurementId: { type: 'string', default: '', pattern: '^(G-[A-Z0-9]{4,20})?$', hint: 'e.g. G-XXXXXXXXXX' } }, roles: ['WEB_MANAGER'] },
    { acm: 155, key: 'mailchimpSync', group: 'integrations', label: 'Daily Mailchimp sync of opted-in customers (API key & audience in Integrations)', fields: { enabled: bool(false) }, roles: ['MARKETING_MANAGER'], public: false },
    { acm: 156, key: 'whatsappInvoices', group: 'integrations', label: 'Customers can receive invoices on WhatsApp', fields: { enabled: bool(false) }, roles: [] },

    // ─── Gap K ────────────────────────────────────────────────────────────────────────────────────────────
    { acm: 157, key: 'zoneDeliveryPricing', group: 'pricing', label: 'Per-zone delivery fee overrides (set fees under Zone Delivery Pricing)', fields: { enabled: bool(false) }, perCity: true, roles: ['CITY_MANAGER'] },

    // ─── Gaps T, R ────────────────────────────────────────────────────────────────────────────────────────
    { acm: 158, key: 'vendorReviewResponses', group: 'ratings', label: 'Vendors can respond to customer reviews', fields: { enabled: bool(true) }, perCity: true, roles: ['CITY_MANAGER'] },
    { acm: 159, key: 'splitRatings', group: 'ratings', label: 'Separate meal / delivery / overall ratings (off = one overall rating)', fields: { enabled: bool(true) }, roles: [] },

    // ─── Gap W — admin override of customer notification preferences (no ACM number in the SOP) ───────────
    { acm: null, ref: 'W', key: 'forcedNotifications', group: 'marketing', label: 'Notification types delivered to every customer regardless of their preferences', fields: { types: { type: 'multiselect', options: NOTIFICATION_TYPES, default: [] } }, roles: [], public: false },

    // ─── Gap Y ────────────────────────────────────────────────────────────────────────────────────────────
    { acm: 160, key: 'customerSegments', group: 'marketing', label: 'Customer segments / groups for targeted campaigns', fields: { enabled: bool(false) }, roles: ['MARKETING_MANAGER'] },

    // ─── Gap AA ───────────────────────────────────────────────────────────────────────────────────────────
    { acm: 161, key: 'homeCookTrack1', group: 'vendor', label: 'Home cooks can join on Track 1 (działalność nierejestrowana)', fields: { enabled: bool(true) }, perCity: true, roles: [] },
    { acm: 162, key: 'track1Threshold', group: 'vendor', label: 'Track 1 monthly earnings limit and warning level', fields: { legalLimit: num(3499.5, 0, 1000000, { step: 0.01, hint: '75% of the minimum gross wage' }), warningPct: num(80, 1, 100), adminAlertAmount: num(3000, 0, 1000000, { step: 0.01 }) }, roles: [] },
    { acm: 163, key: 'sanepidGracePeriod', group: 'vendor', label: 'Days a Track 1 cook may trade before the Sanepid document is uploaded', fields: { days: num(30, 0, 180) }, perCity: true, roles: ['CITY_MANAGER'] },
    { acm: 164, key: 'gmpTemplate', group: 'vendor', label: 'GMP/GHP template and Sanepid checklist served to Track 1 cooks', fields: { templateUrl: { type: 'string', default: '' }, checklistUrl: { type: 'string', default: '' }, version: { type: 'string', default: '1.0' }, language: { type: 'string', default: 'pl' } }, roles: ['WEB_MANAGER'] },
    { acm: 165, key: 'kitchenPhotoReview', group: 'vendor', label: 'Kitchen photos must be reviewed before a Track 1 cook goes live', fields: { required: bool(true), minPhotos: num(2, 1, 10) }, roles: ['CITY_MANAGER'] },

    // ─── Gaps AB, AC, AD ──────────────────────────────────────────────────────────────────────────────────
    { acm: 166, key: 'settlementStatements', group: 'vendor', label: 'Monthly settlement statements (Rozliczenie) for Track 1 cooks — 1st of month 06:00', fields: { enabled: bool(true) }, roles: [] },
    { acm: 167, key: 'preparedByCredit', group: 'visibility', audience: 'customer', item: '"Prepared by [first name]"', label: 'Show "Prepared by [cook first name]" on customer receipts', fields: { enabled: bool(false) }, roles: [] },
    { acm: 168, key: 'legalReacceptance', group: 'legal', label: 'Enforce re-acceptance of legal documents published with "requires re-acceptance"', fields: { enabled: bool(true) }, roles: ['WEB_MANAGER'] },
    { acm: 169, key: 'preferredFleetRequests', group: 'driver', label: 'Vendors may request their own preferred delivery partner', fields: { enabled: bool(true) }, roles: [] },
    { acm: 170, key: 'preferredFleetRouting', group: 'driver', label: 'Route a vendor\'s pickups to its preferred partner first (pool as fallback)', fields: { enabled: bool(true) }, perCity: true, roles: ['CITY_MANAGER'] },

    // ─── Addendum 3 — AE, AF, AG, AH ──────────────────────────────────────────────────────────────────────
    { acm: 171, key: 'calendarPreviewDays', group: 'vendor', label: 'Days ahead the customer calendar shows upcoming meals', fields: { days: num(10, 2, 14) }, roles: [] },
    { acm: 172, key: 'familyBox', group: 'plans', label: 'Family Box (2–4 people, one delivery)', fields: { enabled: bool(true), discountPct: num(0, 0, 50), maxMembers: num(4, 2, 4) }, perCity: true, roles: [] },
    { acm: 173, key: 'selectMode', group: 'plans', label: 'Select mode — single meal, no subscription', fields: { enabled: bool(true), oneTimeFeeMultiplier: num(1.5, 1, 5, { step: 0.1, hint: 'One-time delivery fee = standard fee × this' }) }, perCity: true, roles: [] },
    { acm: 174, key: 'medicalSpecialisms', group: 'vendor', label: 'Vendors can apply for medical diet specialisms', fields: { enabled: bool(true) }, roles: ['CITY_MANAGER'] },
    { acm: 175, key: 'dietitianBadgeValidity', group: 'vendor', label: 'Months a "Dietitian Certified" badge stays valid', fields: { months: num(12, 1, 36) }, roles: [] },

    // ─── Addendum 4 — AI, AJ ──────────────────────────────────────────────────────────────────────────────
    { acm: 176, key: 'ecoBadgeVerification', group: 'vendor', label: 'Eco-packaging badge needs admin verification (off = self-declared)', fields: { required: bool(true) }, roles: ['CITY_MANAGER'] },
    { acm: 177, key: 'weekendDelivery', group: 'slots', label: 'Weekend delivery days open to vendors and customers', fields: { saturday: bool(false), sunday: bool(false) }, perCity: true, roles: ['CITY_MANAGER'] },

    // ─── Addendum 5 — AK ──────────────────────────────────────────────────────────────────────────────────
    { acm: 178, key: 'smartRotation', group: 'rotation', label: 'Smart Rotation (2–5 makers, different kitchen each day)', fields: { enabled: bool(false) }, perCity: true, roles: ['CITY_MANAGER'] },
    { acm: 179, key: 'rotationMaxMakers', group: 'rotation', label: 'Maximum makers in one rotation', fields: { value: num(5, 2, 7) }, roles: [] },
    { acm: 180, key: 'rotationVendorTypes', group: 'rotation', label: 'Vendor types allowed in rotations', fields: { allowed: { type: 'multiselect', options: VENDOR_TYPES, default: VENDOR_TYPES } }, perCity: true, roles: ['CITY_MANAGER'] },
    { acm: 181, key: 'rotationMinDaysPerMaker', group: 'rotation', label: 'Minimum days assigned to each maker', fields: { value: num(1, 1, 3) }, roles: [] },

    // ─── Addendum 6 — AL ──────────────────────────────────────────────────────────────────────────────────
    { acm: 182, key: 'temperatureLabels', group: 'vendor', label: 'Which 🔥 Hot / ❄ Cold labels customers see', fields: { display: { type: 'enum', options: ['both', 'hot_only', 'cold_only', 'hidden'], default: 'both' } }, perCity: true, roles: ['CITY_MANAGER'] },
    { acm: 183, key: 'temperatureMandatory', group: 'vendor', label: 'Vendors must choose Hot or Cold before publishing a meal', fields: { enabled: bool(true) }, roles: [] },

    // ─── Subscription plans owned by vendors ──────────────────────────────────────────────────────────────
    { acm: 184, key: 'subscriptionPlatformFee', group: 'plans', label: 'One-time platform fee per subscription (on = this amount for every plan; off = the fee stored on each plan)', fields: { enabled: bool(false), amount: num(0, 0, 1000, { step: 0.5 }) }, roles: [] }
];

/** Information that can never be hidden (EU law) — shown locked in the visibility matrix. */
export const EU_LOCKED_VISIBILITY = [
    { audience: 'customer', item: 'Final price the customer pays', citation: 'Directive 2011/83/EU art. 6(1)(e) and Directive 98/6/EC — total price must be shown' },
    { audience: 'customer', item: 'B2B VAT invoice breakdown', citation: 'Council Directive 2006/112/EC art. 226 — mandatory invoice details' },
    { audience: 'customer', item: 'B2C receipt total', citation: 'Polish VAT Act art. 111 / fiscal receipt rules' },
    { audience: 'all', item: 'GDPR privacy notice', citation: 'GDPR art. 13 — information to be provided to the data subject' }
];

export const ACM_BY_KEY = Object.fromEntries(ACM_CONTROLS.map((c) => [c.key, c]));
export const ACM_BY_NUMBER = Object.fromEntries(ACM_CONTROLS.filter((c) => c.acm).map((c) => [c.acm, c]));

export const defaultValueOf = (control) =>
    Object.fromEntries(Object.entries(control.fields).map(([k, f]) => [k, Array.isArray(f.default) ? [...f.default] : f.default]));

/** Validates and coerces a (partial) value for a control. Throws with a readable message. */
export const coerceValue = (control, input = {}) => {
    const out = {};
    for (const [name, field] of Object.entries(control.fields)) {
        if (!(name in input)) continue;
        const raw = input[name];
        switch (field.type) {
            case 'boolean':
                out[name] = raw === true || raw === 'true' || raw === 1 || raw === 'on';
                break;
            case 'number': {
                const n = Number(raw);
                if (!Number.isFinite(n)) throw new Error(`${control.acm ? `ACM-${control.acm}` : control.key} ${name}: must be a number`);
                if (field.min !== undefined && n < field.min) throw new Error(`${control.acm ? `ACM-${control.acm}` : control.key} ${name}: minimum is ${field.min}`);
                if (field.max !== undefined && n > field.max) throw new Error(`${control.acm ? `ACM-${control.acm}` : control.key} ${name}: maximum is ${field.max}`);
                out[name] = n;
                break;
            }
            case 'enum':
                if (!field.options.includes(raw)) throw new Error(`${control.acm ? `ACM-${control.acm}` : control.key} ${name}: must be one of ${field.options.join(', ')}`);
                out[name] = raw;
                break;
            case 'multiselect': {
                const list = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map((s) => String(s).trim()).filter(Boolean);
                const bad = list.filter((v) => !field.options.includes(v));
                if (bad.length) throw new Error(`${control.acm ? `ACM-${control.acm}` : control.key} ${name}: unknown option(s) ${bad.join(', ')}`);
                out[name] = [...new Set(list)];
                break;
            }
            default: {
                const s = String(raw ?? '').trim().slice(0, 500);
                if (field.pattern && !new RegExp(field.pattern).test(s)) throw new Error(`${control.acm ? `ACM-${control.acm}` : control.key} ${name}: invalid format`);
                out[name] = s;
            }
        }
    }
    return out;
};
