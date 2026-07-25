/**
 * DailyMealBox Admin Sidebar Menu — PRD-aligned
 *
 * Role visibility:
 *   roles: undefined  → visible to all admins
 *   roles: ['SUPER_ADMIN', 'ACCOUNTANT']  → visible only to those roles
 *
 * Q2 decision: PLN currency throughout, INR removed.
 * Q4 decision: non-PRD items removed from sidebar (routes kept for now).
 */

export const adminSidebarMenu = [
  // ─── Dashboard (all roles) ──────────────────────────────────────────────
  {
    type: "link",
    label: "Dashboard",
    path: "/admin/food",
    icon: "LayoutDashboard",
  },

  // ─── Live Operations Map (AP-02) ─────────────────────────────────────────
  {
    type: "link",
    label: "Live Operations Map",
    path: "/admin/food/live-map",
    icon: "MapPin",
    roles: ["SUPER_ADMIN", "CITY_MANAGER", "FLEET_MANAGER"],
  },

  // ─── VENDOR MANAGEMENT ──────────────────────────────────────────────────
  {
    type: "section",
    label: "VENDOR MANAGEMENT",
    roles: ["SUPER_ADMIN", "CITY_MANAGER"],
    items: [
      {
        type: "link",
        label: "All Vendors",
        path: "/admin/food/restaurants",
        icon: "Users",
      },
      {
        type: "link",
        label: "Vendor Request",
        path: "/admin/food/vendor-request",
        icon: "UserCog",
      },
      {
        type: "link",
        label: "Vendor Timing",
        path: "/admin/food/vendor-timing",
        icon: "Clock",
      },
      {
        type: "link",
        label: "Subscription Plans",
        path: "/admin/food/subscription-plans",
        icon: "Award",
      },
      {
        type: "link",
        label: "Subscribers",
        path: "/admin/food/subscribers",
        icon: "Users",
      },
      // {
      //   type: "link",
      //   label: "Restaurant Commission",
      //   path: "/admin/food/restaurants/commission",
      //   icon: "DollarSign",
      // },
    ],
  },


  // ─── DRIVER MANAGEMENT ──────────────────────────────────────────────────
  {
    type: "section",
    label: "DRIVER MANAGEMENT",
    roles: ["SUPER_ADMIN", "CITY_MANAGER", "FLEET_MANAGER"],
    items: [
      {
        type: "expandable",
        label: "Deliveryman",
        icon: "Package",
        subItems: [
          { label: "New Join Request", path: "/admin/food/delivery-partners/join-request" },
          { label: "Deliveryman List", path: "/admin/food/delivery-partners" },
          { label: "Deliveryman Reviews", path: "/admin/food/delivery-partners/reviews" },
          { label: "Bonus", path: "/admin/food/delivery-partners/bonus" },
          { label: "Earning Addon", path: "/admin/food/delivery-partners/earning-addon" },
          { label: "Earning Addon History", path: "/admin/food/delivery-partners/earning-addon-history" },
          { label: "Delivery Earnings", path: "/admin/food/delivery-partners/earnings" },
        ],
      },
      // { type: "link", label: "Driver Document Review", path: "/admin/food/fleet/driver-documents", icon: "FileText", roles: ["SUPER_ADMIN", "FLEET_MANAGER"] },
      { type: "link", label: "Delivery Cash Limit", path: "/admin/food/delivery-cash-limit", icon: "Wallet" },
      { type: "link", label: "Cash Limit Settlement", path: "/admin/food/cash-limit-settlement", icon: "Receipt" },
      { type: "link", label: "Order-Based Delivery Fee", path: "/admin/food/order-based-delivery-fee", icon: "DollarSign" },
      { type: "link", label: "Delivery Support Tickets", path: "/admin/food/delivery-support-tickets", icon: "MessageSquare" },
      { type: "link", label: "Delivery Emergency Help", path: "/admin/food/delivery-emergency-help", icon: "Phone" },
    ],
  },

  // ─── CUSTOMER MANAGEMENT ────────────────────────────────────────────────
  {
    type: "section",
    label: "CUSTOMER MANAGEMENT",
    roles: ["SUPER_ADMIN", "CUSTOMER_SERVICE"],
    items: [
      {
        type: "link",
        label: "Customers",
        path: "/admin/food/customers",
        icon: "Users",
      },
      {
        type: "link",
        label: "User Feedback",
        path: "/admin/food/contact-messages",
        icon: "Mail",
      },
      {
        type: "link",
        label: "Customer Wallets",
        path: "/admin/food/customers/wallets",
        icon: "Wallet",
      },
    ],
  },

  // ─── KITCHEN PARTNERS MANAGEMENT ──────────────────────────────────────────
  {
    type: "section",
    label: "KITCHEN PARTNERS",
    roles: ["SUPER_ADMIN"],
    items: [
      {
        type: "link",
        label: "All Kitchen Partners",
        path: "/admin/food/kitchen-partners",
        icon: "ChefHat",
      },
    ],
  },

  // ─── OFFICE & CORPORATE ─────────────────────────────────────────────────
  {
    type: "section",
    label: "OFFICE & CORPORATE",
    roles: ["SUPER_ADMIN"],
    items: [
      {
        type: "link",
        label: "Office Approvals",
        path: "/admin/food/office-approvals",
        icon: "Building2",
      },
      {
        type: "link",
        label: "Approved Offices",
        path: "/admin/food/approved-offices",
        icon: "Building",
      },
      {
        type: "link",
        label: "Office Payments",
        path: "/admin/food/office-payments",
        icon: "Receipt",
      },
    ],
  },

  // ─── ROLES & EMPLOYEES (AP-09) ───────────────────────────────────────────
  {
    type: "section",
    label: "ROLES & EMPLOYEES",
    roles: ["SUPER_ADMIN"],
    items: [
      { type: "link", label: "Roles & Permissions", path: "/admin/food/roles-permissions", icon: "Shield" },
      { type: "link", label: "Employees", path: "/admin/food/employee-role", icon: "Users" },
    ],
  },

  // ─── COMPLAINT & REFUNDS (AP-04) ─────────────────────────────────────────
  {
    type: "section",
    label: "COMPLAINTS & REFUNDS",
    roles: ["SUPER_ADMIN", "CUSTOMER_SERVICE"],
    items: [
      {
        type: "link",
        label: "Complaint Inbox",
        path: "/admin/food/complaints",
        icon: "MessageSquare",
      },
    ],
  },



  // ─── ORDER MANAGEMENT ───────────────────────────────────────────────────
  {
    type: "section",
    label: "ORDER MANAGEMENT",
    items: [
      {
        type: "expandable",
        label: "Orders",
        icon: "FileText",
        subItems: [
          { label: "All Orders", path: "/admin/food/orders/all" },
          { label: "Scheduled", path: "/admin/food/orders/scheduled" },
          { label: "Pending", path: "/admin/food/orders/pending" },
          { label: "Accepted", path: "/admin/food/orders/accepted" },
          { label: "Processing", path: "/admin/food/orders/processing" },
          { label: "On The Way", path: "/admin/food/orders/food-on-the-way" },
          { label: "Delivered", path: "/admin/food/orders/delivered" },
          { label: "Cancelled", path: "/admin/food/orders/canceled" },
          { label: "Refunded", path: "/admin/food/orders/refunded" },
        ],
      },
      {
        type: "link",
        label: "Manual Order Entry",
        path: "/admin/food/manual-order",
        icon: "Plus",
        roles: ["SUPER_ADMIN", "CUSTOMER_SERVICE"],
      },
    ],
  },

  // // ─── COMPLAINT & REFUNDS (AP-04) ─────────────────────────────────────────
  // {
  //   type: "section",
  //   label: "COMPLAINTS & REFUNDS",
  //   roles: ["SUPER_ADMIN", "CUSTOMER_SERVICE"],
  //   items: [
  //     {
  //       type: "link",
  //       label: "Complaint Inbox",
  //       path: "/admin/food/complaints",
  //       icon: "MessageSquare",
  //     },
  //   ],
  // },


  // ─── FOOD MANAGEMENT ────────────────────────────────────────────────────
  {
    type: "section",
    label: "FOOD MANAGEMENT",
    roles: ["SUPER_ADMIN", "CITY_MANAGER"],
    items: [
      {
        type: "link",
        label: "Food Approval",
        path: "/admin/food/food-approval",
        icon: "CheckCircle2",
      },
      {
        type: "expandable",
        label: "Foods & Categories",
        icon: "Utensils",
        subItems: [
          { label: "Foods List", path: "/admin/food/foods" },
          { label: "Addon Approvals", path: "/admin/food/addons" },
          { label: "Categories", path: "/admin/food/categories" },
          { label: "Menu Bulk Upload", path: "/admin/food/restaurants/menu-bulk-upload" },
        ],
      },
    ],
  },


  // ─── FLEET MANAGEMENT (AP-06 FM) ─────────────────────────────────────────
  // {
  //   type: "section",
  //   label: "FLEET MANAGEMENT",
  //   roles: ["SUPER_ADMIN", "FLEET_MANAGER", "ACCOUNTANT"],
  //   items: [
  //     { type: "link", label: "Fleet Dashboard", path: "/admin/food/fleet/dashboard", icon: "Truck" },
  //     { type: "link", label: "Fleet Partners", path: "/admin/food/fleet/partners", icon: "Building2" },
  //     { type: "link", label: "Fleet Invoices", path: "/admin/food/fleet/invoices", icon: "Receipt" },
  //   ],
  // },

  // ─── ZONE & CITY MANAGEMENT (AP-08) ──────────────────────────────────────
  {
    type: "section",
    label: "ZONE & CITY MANAGEMENT",
    roles: ["SUPER_ADMIN", "CITY_MANAGER"],
    items: [
      { type: "link", label: "City Management", path: "/admin/food/cities", icon: "Globe" },
      { type: "link", label: "Zone Setup", path: "/admin/food/zone-setup", icon: "MapPin" },
      { type: "link", label: "Zone Ranking", path: "/admin/food/zone-ranking", icon: "MapPin" },
    ],
  },

  // ─── PROMOTIONS MANAGEMENT ───────────────────────────────────────────────
  {
    type: "section",
    label: "PROMOTIONS MANAGEMENT",
    roles: ["SUPER_ADMIN", "MARKETING_MANAGER"],
    items: [
      { type: "link", label: "Coupons & Offers", path: "/admin/food/coupons", icon: "Gift" },
      { type: "link", label: "Referral Settings", path: "/admin/food/referral-settings", icon: "Gift" },
      { type: "link", label: "Banners", path: "/admin/food/banners", icon: "Image" },
    ],
  },

  // ─── FINANCIAL MANAGEMENT (AP-07) ────────────────────────────────────────
  {
    type: "section",
    label: "FINANCIAL MANAGEMENT",
    roles: ["SUPER_ADMIN", "ACCOUNTANT"],
    items: [
      { type: "link", label: "Financial Overview", path: "/admin/food/financial", icon: "DollarSign" },
      { type: "link", label: "Restaurant Withdrawals", path: "/admin/food/restaurant-withdraws", icon: "CreditCard" },
      { type: "link", label: "Delivery Withdrawals", path: "/admin/food/delivery-withdrawal", icon: "Wallet" },
      { type: "link", label: "Delivery Boy Wallet", path: "/admin/food/delivery-boy-wallet", icon: "PiggyBank" },
      // { type: "link", label: "Fee Settings", path: "/admin/food/fee-settings", icon: "DollarSign" },
    ],
  },

  // ─── REPORTS (AP-11) ─────────────────────────────────────────────────────
  {
    type: "section",
    label: "REPORTS",
    roles: ["SUPER_ADMIN", "ACCOUNTANT", "CITY_MANAGER"],
    items: [
      { type: "link", label: "Transaction Report", path: "/admin/food/transaction-report", icon: "FileText" },
      { type: "link", label: "Order Report", path: "/admin/food/order-report/regular", icon: "FileText" },
      { type: "link", label: "Tax Report", path: "/admin/food/tax-report", icon: "Receipt" },
      { type: "link", label: "VAT Report", path: "/admin/food/vat-report", icon: "Receipt" },
      { type: "link", label: "Restaurant Report", path: "/admin/food/restaurant-report", icon: "FileText" },
      { type: "link", label: "Feedback Experience", path: "/admin/food/customer-report/feedback-experience", icon: "FileText" },
    ],
  },

  // ─── FEATURE TOGGLES (AP-03) ─────────────────────────────────────────────
  // {
  //   type: "section",
  //   label: "FEATURE FLAGS",
  //   roles: ["SUPER_ADMIN", "CITY_MANAGER"],
  //   items: [
  //     { type: "link", label: "Feature Toggles", path: "/admin/food/feature-toggles", icon: "Zap" },
  //   ],
  // },

  // // ─── INTEGRATION & ENVIRONMENT (AP-09 / AP-12) ───────────────────────────
  // {
  //   type: "section",
  //   label: "INTEGRATIONS & ENV",
  //   roles: ["SUPER_ADMIN"],
  //   items: [
  //     { type: "link", label: "Integration Settings", path: "/admin/food/integrations", icon: "Link" },
  //     { type: "link", label: "Environment Management", path: "/admin/food/environments", icon: "Database" },
  //     { type: "link", label: "Audit Logs", path: "/admin/food/audit-logs", icon: "FileText" },
  //   ],
  // },

  // ─── OTA & CONTENT (AP-13) ───────────────────────────────────────────────
  {
    type: "section",
    label: "OTA & CONTENT",
    roles: ["SUPER_ADMIN", "WEB_MANAGER"],
    items: [
      // { type: "link", label: "OTA Config & Theme", path: "/admin/food/ota-config", icon: "Palette" },
      // { type: "link", label: "Email Templates", path: "/admin/food/email-template", icon: "Mail" },
      { type: "link", label: "About Us", path: "/admin/food/pages-social-media/about", icon: "Globe" },
      { type: "link", label: "Terms & Conditions", path: "/admin/food/pages-social-media/terms", icon: "FileText" },
      { type: "link", label: "Privacy Policy", path: "/admin/food/pages-social-media/privacy", icon: "Lock" },
    ],
  },

  // ─── ROLES & EMPLOYEES (AP-09) ───────────────────────────────────────────
  // {
  //   type: "section",
  //   label: "ROLES & EMPLOYEES",
  //   roles: ["SUPER_ADMIN"],
  //   items: [
  //     { type: "link", label: "Roles & Permissions", path: "/admin/food/employee-role", icon: "Lock" },
  //     { type: "link", label: "Employees", path: "/admin/food/employees", icon: "UserCog" },
  //   ],
  // },

  // ─── SERVICE MANAGEMENT ─────────────────────────────────────────────────
  {
    type: "section",
    label: "SERVICE MANAGEMENT",
    items: [
      { type: "link", label: "Delivery Service", path: "/admin/food/service/delivery", icon: "Truck" },
      { type: "link", label: "Vendor Service", path: "/admin/food/service/vendor", icon: "UtensilsCrossed" },
      { type: "link", label: "Customer Service", path: "/admin/food/service/customer", icon: "Users" },
    ],
  },

  // ─── SYSTEM SETTINGS ─────────────────────────────────────────────────────
  {
    type: "section",
    label: "SYSTEM SETTINGS",
    roles: ["SUPER_ADMIN"],
    items: [
      { type: "link", label: "Business Setup", path: "/admin/food/business-setup", icon: "Settings" },
      { type: "link", label: "Theme Settings", path: "/admin/food/theme-settings", icon: "Palette" },
      { type: "link", label: "Broadcast Notification", path: "/admin/food/broadcast-notification", icon: "Bell" },
      // { type: "link", label: "Delivery Boy Commission", path: "/admin/food/delivery-boy-commission", icon: "DollarSign" },
    ],
  },
];
