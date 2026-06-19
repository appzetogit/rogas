export const ADMIN_PRD_ROLES = [
    'SUPER_ADMIN',
    'ACCOUNTANT',
    'CUSTOMER_SERVICE',
    'CITY_MANAGER',
    'MARKETING_MANAGER',
    'WEB_MANAGER',
    'FLEET_MANAGER'
];

export const ADMIN_PRD_PERMISSIONS = {
    SUPER_ADMIN: ['*'],
    ACCOUNTANT: [
        'dashboard.finance.read',
        'finance.read',
        'finance.payouts.manage',
        'finance.cashSettlement.manage',
        'fleet.invoices.manage',
        'reports.finance.export'
    ],
    CUSTOMER_SERVICE: [
        'dashboard.support.read',
        'customers.read',
        'customers.block',
        'orders.read',
        'orders.manual.create',
        'complaints.read',
        'complaints.manage',
        'refunds.issue_limited',
        'support.manage'
    ],
    CITY_MANAGER: [
        'dashboard.city.read',
        'operations.map.read',
        'vendors.city.manage',
        'drivers.city.manage',
        'zones.manage',
        'featureToggles.city.manage',
        'analytics.city.read'
    ],
    MARKETING_MANAGER: [
        'campaigns.manage',
        'banners.manage',
        'coupons.manage',
        'pushCampaigns.manage',
        'referrals.manage_limited',
        'loyalty.manage'
    ],
    WEB_MANAGER: [
        'content.faq.manage',
        'content.help.manage',
        'content.emailTemplates.manage',
        'content.onboarding.manage',
        'content.legal.manage'
    ],
    FLEET_MANAGER: [
        'dashboard.fleet.read',
        'fleet.partners.manage',
        'fleet.documents.review',
        'fleet.compliance.read',
        'fleet.invoices.review'
    ]
};

export const FEATURE_TOGGLE_CATEGORIES = [
    'ordering',
    'slots',
    'payments',
    'smart',
    'delivery',
    'driver',
    'language',
    'notifications',
    'marketing',
    'fleet'
];

export const FEATURE_TOGGLE_STATES = ['on', 'off', 'partial'];

export const DEFAULT_FEATURE_TOGGLES = [
    ['ordering.subscriptions', 'ordering', 'Subscriptions'],
    ['ordering.oneTimeOrders', 'ordering', 'One-time orders'],
    ['ordering.manualOrders', 'ordering', 'Manual order entry'],
    ['ordering.skipMeal', 'ordering', 'Skip meal'],
    ['ordering.changeMeal', 'ordering', 'Change meal'],
    ['ordering.giftSubscriptions', 'ordering', 'Gift subscriptions'],
    ['slots.breakfast', 'slots', 'Breakfast slot'],
    ['slots.lunch', 'slots', 'Lunch slot'],
    ['slots.dinner', 'slots', 'Dinner slot'],
    ['payments.cod', 'payments', 'Cash on delivery'],
    ['payments.wallet', 'payments', 'Wallet payments'],
    ['payments.razorpay', 'payments', 'Razorpay'],
    ['payments.przelewy24', 'payments', 'Przelewy24'],
    ['payments.stripe', 'payments', 'Stripe'],
    ['smart.forecasting', 'smart', 'Food forecasting'],
    ['smart.fraudAlerts', 'smart', 'Fraud alerts'],
    ['smart.routeOptimization', 'smart', 'Route optimization'],
    ['delivery.liveTracking', 'delivery', 'Live tracking'],
    ['delivery.driverReassignment', 'delivery', 'Driver reassignment'],
    ['delivery.collectionPins', 'delivery', 'Collection PINs'],
    ['driver.cashLimitAlerts', 'driver', 'Cash limit alerts'],
    ['driver.bonusProgram', 'driver', 'Bonus programme'],
    ['driver.shiftReminders', 'driver', 'Shift reminders'],
    ['language.english', 'language', 'English'],
    ['language.hindi', 'language', 'Hindi'],
    ['language.polish', 'language', 'Polish'],
    ['notifications.promotional', 'notifications', 'Promotional notifications'],
    ['notifications.transactional', 'notifications', 'Transactional notifications'],
    ['marketing.flashDeals', 'marketing', 'Flash deals'],
    ['marketing.referrals', 'marketing', 'Referral programme'],
    ['marketing.loyalty', 'marketing', 'Loyalty programme'],
    ['fleet.partnerPortal', 'fleet', 'Fleet partner portal'],
    ['fleet.invoiceGeneration', 'fleet', 'Fleet invoice generation']
].map(([key, category, label]) => ({ key, category, label }));
