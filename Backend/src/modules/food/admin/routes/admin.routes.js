import express from 'express';
import { AuthError } from '../../../../core/auth/errors.js';
import * as adminController from '../controllers/admin.controller.js';
import * as foodApprovalController from '../controllers/foodApproval.controller.js';
import * as addonsApprovalController from '../controllers/addonsApproval.controller.js';
import * as businessSettingsController from '../controllers/businessSettings.controller.js';
import * as feedbackExperienceController from '../controllers/feedbackExperience.controller.js';
import * as notificationBroadcastController from '../controllers/notificationBroadcast.controller.js';
import * as prdAdminController from '../controllers/prdAdmin.controller.js';
import * as prdAdminExtController from '../controllers/prdAdminExtended.controller.js';
// Dining admin controller removed — not part of DailyMealBox PRD
import * as orderController from '../../orders/controllers/order.controller.js';
import { getAdminPageController, upsertAdminPageController } from '../controllers/pageContent.controller.js';
import * as liveMonitorController from '../controllers/liveMonitor.controller.js';
import * as officeCompanyApprovalController from '../controllers/officeCompanyApproval.controller.js';
import * as appIntroAdController from '../controllers/appIntroAd.controller.js';
import { upload } from '../../../../middleware/upload.js';
import menuBulkRoutes from './menuBulk.routes.js';
import kitchenPartnerRoutes from './kitchenPartner.routes.js';
import roleRoutes from './role.routes.js';
import adminWalletRoutes from './adminWallet.routes.js';
import { requirePermission } from '../../../../middleware/rbac.middleware.js';

const router = express.Router();

router.use('/menu', menuBulkRoutes);
router.use('/custom-roles', roleRoutes);
router.use('/customers/wallet', adminWalletRoutes);

// ----- Public Business Settings (No Admin Required) -----
router.get('/business-settings/public', businessSettingsController.getBusinessSettings);

const requireAdmin = (req, _res, next) => {
    const user = req.user;
    if (!user || user.role !== 'ADMIN') {
        return next(new AuthError('Admin access required'));
    }
    return next();
};

router.use(requireAdmin);

// ----- Admin PRD Core Controls -----
router.get('/roles/matrix', requirePermission('rolesEmployees', 'view'), prdAdminController.getRoleMatrix);
router.get('/roles/users', requirePermission('rolesEmployees', 'view'), prdAdminController.listAdminUsers);
router.patch('/roles/users/:id', requirePermission('rolesEmployees', 'edit'), prdAdminController.updateAdminRole);
router.get('/audit-logs', requirePermission('systemSettings', 'view'), prdAdminController.listAuditLogs);
router.get('/fraud-alerts', requirePermission('systemSettings', 'view'), prdAdminController.getFraudAlerts);

// ----- AP-09 Employee Management -----
router.post('/employees', requirePermission('rolesEmployees', 'create'), prdAdminExtController.createAdminEmployee);
router.patch('/employees/:id', requirePermission('rolesEmployees', 'edit'), prdAdminExtController.updateAdminEmployee);
router.delete('/employees/:id', requirePermission('rolesEmployees', 'delete'), prdAdminExtController.deleteAdminEmployee);

// ----- AP-02 Live Operations Map -----
router.get('/operations/snapshot', requirePermission('dashboard', 'view'), prdAdminController.getOperationsSnapshot);

// ----- AP-03 Feature Toggles -----
router.get('/feature-toggles', requirePermission('featureFlags', 'view'), prdAdminController.listFeatureToggles);
router.put('/feature-toggles', requirePermission('featureFlags', 'edit'), prdAdminController.upsertFeatureToggle);
router.post('/feature-toggles/:id/rollback', requirePermission('featureFlags', 'edit'), prdAdminController.rollbackFeatureToggle);

// ----- AP-04 Complaint & Refund Management -----
router.get('/complaints', requirePermission('complaintsRefunds', 'view'), prdAdminExtController.listComplaints);
router.post('/complaints', requirePermission('complaintsRefunds', 'create'), prdAdminExtController.createComplaint);
router.get('/complaints/:id', requirePermission('complaintsRefunds', 'view'), prdAdminExtController.getComplaintById);
router.patch('/complaints/:id/status', requirePermission('complaintsRefunds', 'edit'), prdAdminExtController.updateComplaintStatus);
router.post('/complaints/:id/refund', requirePermission('complaintsRefunds', 'edit'), prdAdminExtController.issueComplaintRefund);
router.post('/complaints/:id/escalate', requirePermission('complaintsRefunds', 'edit'), prdAdminExtController.escalateComplaint);
router.post('/complaints/:id/respond', requirePermission('complaintsRefunds', 'edit'), prdAdminExtController.sendComplaintResponse);

// ----- AP-07 Fleet Invoice & Financial -----
router.get('/fleet/invoices', requirePermission('fleetManagement', 'view'), prdAdminExtController.listFleetInvoices);
router.patch('/fleet/invoices/:id/approve', requirePermission('fleetManagement', 'edit'), prdAdminExtController.approveFleetInvoice);
router.patch('/fleet/invoices/:id/reject', requirePermission('fleetManagement', 'edit'), prdAdminExtController.rejectFleetInvoice);
router.patch('/fleet/invoices/:id/paid', requirePermission('fleetManagement', 'edit'), prdAdminExtController.markFleetInvoicePaid);
router.get('/reports/vat', requirePermission('reports', 'view'), prdAdminExtController.getVatReport);

// ----- AP-08 City Management -----
router.get('/cities', requirePermission('zoneCityManagement', 'view'), prdAdminController.listCities);
router.post('/cities', requirePermission('zoneCityManagement', 'create'), prdAdminController.createCity);
router.patch('/cities/:id', requirePermission('zoneCityManagement', 'edit'), prdAdminController.updateCity);
router.get('/cities/:id/activation-checklist', requirePermission('zoneCityManagement', 'view'), prdAdminController.getCityChecklist);

// ----- AP-09 API & Integration Settings -----
router.get('/integrations', requirePermission('systemSettings', 'view'), prdAdminController.listIntegrations);
router.put('/integrations', requirePermission('systemSettings', 'edit'), prdAdminController.upsertIntegration);

// ----- AP-12 Environment Management -----
router.get('/environments', requirePermission('systemSettings', 'view'), prdAdminController.listEnvironments);
router.put('/environments', requirePermission('systemSettings', 'edit'), prdAdminController.upsertEnvironment);

// ----- AP-13 OTA Config -----
router.get('/ota-configs', requirePermission('otaContent', 'view'), prdAdminController.listOtaConfigs);
router.post('/ota-configs', requirePermission('otaContent', 'create'), prdAdminController.createOtaConfig);
router.post('/ota-configs/:id/publish', requirePermission('otaContent', 'edit'), prdAdminController.publishOtaConfig);

// ----- FM-01/FM-02/FM-03 Fleet Manager -----
router.get('/fleet/dashboard', requirePermission('fleetManagement', 'view'), prdAdminController.getFleetDashboard);
router.get('/fleet/partners', requirePermission('fleetManagement', 'view'), prdAdminController.listFleetPartners);
router.post('/fleet/partners', requirePermission('fleetManagement', 'create'), prdAdminController.createFleetPartner);
router.patch('/fleet/partners/:id/status', requirePermission('fleetManagement', 'edit'), prdAdminController.updateFleetPartnerStatus);
router.get('/fleet/driver-documents', requirePermission('fleetManagement', 'view'), prdAdminController.listDriverDocuments);
router.put('/fleet/driver-documents', requirePermission('fleetManagement', 'edit'), prdAdminController.upsertDriverDocument);
router.patch('/fleet/driver-documents/:id/review', requirePermission('fleetManagement', 'edit'), prdAdminController.reviewDriverDocument);

// ----- Broadcast Notifications -----
router.post('/notifications/broadcast', requirePermission('systemSettings', 'create'), notificationBroadcastController.createBroadcastNotificationController);
router.get('/notifications/broadcast', requirePermission('systemSettings', 'view'), notificationBroadcastController.getBroadcastNotificationsController);
router.delete('/notifications/broadcast/:id', requirePermission('systemSettings', 'delete'), notificationBroadcastController.deleteBroadcastNotificationController);

// ----- Customers -----
router.get('/customers', requirePermission('customerManagement', 'view'), adminController.getCustomers);
router.get('/customers/:id', requirePermission('customerManagement', 'view'), adminController.getCustomerById);
router.patch('/customers/:id/status', requirePermission('customerManagement', 'edit'), adminController.updateCustomerStatus);
router.post('/customers/:id/wallet-topup', requirePermission('customerManagement', 'edit'), adminController.topupCustomerWallet);

// ----- Safety / Emergency Reports -----
router.get('/safety-emergency-reports', requirePermission('driverManagement', 'view'), adminController.getSafetyEmergencyReports);
router.put('/safety-emergency-reports/:id/status', requirePermission('driverManagement', 'edit'), adminController.updateSafetyEmergencyStatus);
router.put('/safety-emergency-reports/:id/priority', requirePermission('driverManagement', 'edit'), adminController.updateSafetyEmergencyPriority);
router.delete('/safety-emergency-reports/:id', requirePermission('driverManagement', 'delete'), adminController.deleteSafetyEmergencyReport);

// ----- Support Tickets (users) -----
router.get('/support-tickets', requirePermission('customerManagement', 'view'), adminController.getSupportTicketsController);
router.patch('/support-tickets/:id', requirePermission('customerManagement', 'edit'), adminController.updateSupportTicketController);
router.get('/global-search', adminController.globalSearch);
router.get('/restaurants/complaints', requirePermission('complaintsRefunds', 'view'), adminController.getRestaurantComplaints);
router.patch('/restaurants/complaints/:id', requirePermission('complaintsRefunds', 'edit'), adminController.updateRestaurantComplaint);

// ----- Restaurants -----
router.get('/restaurants', requirePermission('vendorManagement', 'view'), adminController.getRestaurants);
router.get('/dashboard-stats', requirePermission('dashboard', 'view'), adminController.getDashboardStats);
router.get('/reports/restaurants', requirePermission('reports', 'view'), adminController.getRestaurantReport);
router.get('/reports/transactions', requirePermission('reports', 'view'), adminController.getTransactionReport);
router.get('/reports/tax', requirePermission('reports', 'view'), adminController.getTaxReport);
router.get('/reports/tax/:id', requirePermission('reports', 'view'), adminController.getTaxReportDetail);
router.get('/restaurants/pending', requirePermission('vendorManagement', 'view'), adminController.getPendingRestaurants);
router.get('/restaurants/reviews', requirePermission('vendorManagement', 'view'), adminController.getRestaurantReviews);
router.get('/restaurants/:id/menu-pdf', requirePermission('vendorManagement', 'view'), adminController.getRestaurantMenuPdfDownloadUrl);
router.get('/restaurants/:id/download-menu-pdf', requirePermission('vendorManagement', 'view'), adminController.downloadRestaurantMenuPdf);
router.get('/restaurants/:id', requirePermission('vendorManagement', 'view'), adminController.getRestaurantById);
router.get('/restaurants/:id/analytics', requirePermission('vendorManagement', 'view'), adminController.getRestaurantAnalytics);
router.get('/restaurants/:id/menu', requirePermission('vendorManagement', 'view'), adminController.getRestaurantMenuById);
router.post('/restaurants', requirePermission('vendorManagement', 'create'), adminController.createRestaurant);
router.patch('/restaurants/:id', requirePermission('vendorManagement', 'edit'), adminController.updateRestaurantById);
router.patch('/restaurants/:id/status', requirePermission('vendorManagement', 'edit'), adminController.updateRestaurantStatus);
router.patch('/restaurants/:id/location', requirePermission('vendorManagement', 'edit'), adminController.updateRestaurantLocation);
router.patch('/restaurants/:id/menu', requirePermission('vendorManagement', 'edit'), adminController.updateRestaurantMenuById);
router.patch('/restaurants/:id/approve', requirePermission('vendorManagement', 'edit'), adminController.approveRestaurant);
router.patch('/restaurants/:id/reject', requirePermission('vendorManagement', 'edit'), adminController.rejectRestaurant);
router.patch('/restaurants/:id/zone-rank', requirePermission('vendorManagement', 'edit'), adminController.updateRestaurantZoneRank);
router.delete('/restaurants/:id', requirePermission('vendorManagement', 'delete'), adminController.deleteRestaurant);

// ----- Restaurant Commission -----
router.get('/restaurant-commissions/bootstrap', requirePermission('vendorManagement', 'view'), adminController.getRestaurantCommissionBootstrap);
router.get('/restaurant-commissions', requirePermission('vendorManagement', 'view'), adminController.getRestaurantCommissions);
router.post('/restaurant-commissions', requirePermission('vendorManagement', 'create'), adminController.createRestaurantCommission);
router.get('/restaurant-commissions/:id', requirePermission('vendorManagement', 'view'), adminController.getRestaurantCommissionById);
router.patch('/restaurant-commissions/:id', requirePermission('vendorManagement', 'edit'), adminController.updateRestaurantCommission);
router.delete('/restaurant-commissions/:id', requirePermission('vendorManagement', 'delete'), adminController.deleteRestaurantCommission);
router.patch('/restaurant-commissions/:id/toggle', requirePermission('vendorManagement', 'edit'), adminController.toggleRestaurantCommissionStatus);

// ----- Categories -----
router.get('/categories', requirePermission('foodManagement', 'view'), adminController.getCategories);
router.post('/categories', requirePermission('foodManagement', 'create'), adminController.createCategory);
router.patch('/categories/:id', requirePermission('foodManagement', 'edit'), adminController.updateCategory);
router.delete('/categories/:id', requirePermission('foodManagement', 'delete'), adminController.deleteCategory);
router.patch('/categories/:id/toggle', requirePermission('foodManagement', 'edit'), adminController.toggleCategoryStatus);
router.patch('/categories/:id/approve', requirePermission('foodManagement', 'edit'), adminController.approveCategory);
router.patch('/categories/:id/reject', requirePermission('foodManagement', 'edit'), adminController.rejectCategory);
router.patch('/categories/:id/make-global', requirePermission('foodManagement', 'edit'), adminController.makeCategoryGlobal);

// ----- Restaurant Add-ons Approval -----
router.get('/addons', requirePermission('foodManagement', 'view'), addonsApprovalController.getRestaurantAddons);
router.patch('/addons/:id', requirePermission('foodManagement', 'edit'), addonsApprovalController.updateRestaurantAddon);
router.patch('/addons/:id/approve', requirePermission('foodManagement', 'edit'), addonsApprovalController.approveRestaurantAddon);
router.patch('/addons/:id/reject', requirePermission('foodManagement', 'edit'), addonsApprovalController.rejectRestaurantAddon);

// ----- Foods -----
// Food approval queue (pending items created by restaurants)
router.get('/foods/pending-approvals', requirePermission('foodManagement', 'view'), foodApprovalController.getPendingFoodApprovals);

// ----- Office Companies Approval -----
router.get('/office-companies', requirePermission('vendorManagement', 'view'), officeCompanyApprovalController.getOfficeCompanies);
router.patch('/office-companies/:id/approve', requirePermission('vendorManagement', 'edit'), officeCompanyApprovalController.approveOfficeCompany);
router.patch('/office-companies/:id/reject', requirePermission('vendorManagement', 'edit'), officeCompanyApprovalController.rejectOfficeCompany);

// ----- Office Payments (admin view) -----
router.get('/office-payments', requirePermission('vendorManagement', 'view'), async (req, res) => {
    try {
        const { OfficePayment } = await import('../../../dailymealbox/office/models/officePayment.model.js');
        const { OfficeCompany } = await import('../../../dailymealbox/office/models/officeCompany.model.js');
        const { VendorSubscriptionPlan } = await import('../../../dailymealbox/subscription/vendorSubscriptionPlan.model.js');
        const { FoodRestaurant } = await import('../../restaurant/models/restaurant.model.js');

        const { status, page = 1, limit = 20 } = req.query;
        const filter = {};
        if (status) filter.status = status;

        const skip = (Number(page) - 1) * Number(limit);
        const [payments, total] = await Promise.all([
            OfficePayment.find(filter)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(Number(limit))
                .lean(),
            OfficePayment.countDocuments(filter)
        ]);

        // Enrich with company, plan, vendor names
        const companyIds = [...new Set(payments.map(p => p.companyId).filter(Boolean))];
        const planIds    = [...new Set(payments.map(p => p.subscriptionPlanId).filter(Boolean))];
        const vendorIds  = [...new Set(payments.map(p => p.vendorId).filter(Boolean))];

        const [companies, plans, vendors] = await Promise.all([
            OfficeCompany.find({ _id: { $in: companyIds } }, 'legalName').lean(),
            VendorSubscriptionPlan.find({ _id: { $in: planIds } }, 'name price duration').lean(),
            FoodRestaurant.find({ _id: { $in: vendorIds } }, 'restaurantName').lean(),
        ]);

        const companyMap = Object.fromEntries(companies.map(c => [c._id.toString(), c]));
        const planMap    = Object.fromEntries(plans.map(p => [p._id.toString(), p]));
        const vendorMap  = Object.fromEntries(vendors.map(v => [v._id.toString(), v]));

        const enriched = payments.map(p => ({
            ...p,
            company: companyMap[p.companyId?.toString()] || null,
            plan: planMap[p.subscriptionPlanId?.toString()] || null,
            vendor: vendorMap[p.vendorId?.toString()] || null,
        }));

        res.json({ success: true, data: enriched, total, page: Number(page), limit: Number(limit) });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

router.patch('/foods/bulk-approve', requirePermission('foodManagement', 'edit'), foodApprovalController.bulkApproveFoodItemsController);
router.patch('/foods/:id/approve', requirePermission('foodManagement', 'edit'), foodApprovalController.approveFoodItemController);
router.patch('/foods/:id/reject', requirePermission('foodManagement', 'edit'), foodApprovalController.rejectFoodItemController);

router.get('/foods', requirePermission('foodManagement', 'view'), adminController.getFoods);
router.post('/foods', requirePermission('foodManagement', 'create'), adminController.createFood);
router.patch('/foods/:id', requirePermission('foodManagement', 'edit'), adminController.updateFood);
router.delete('/foods/:id', requirePermission('foodManagement', 'delete'), adminController.deleteFood);

// ----- Offers & Coupons -----
router.get('/offers', requirePermission('promotionsManagement', 'view'), adminController.getAllOffers);
router.post('/offers', requirePermission('promotionsManagement', 'create'), adminController.createAdminOffer);
router.patch('/offers/:id/cart-visibility', requirePermission('promotionsManagement', 'edit'), adminController.updateAdminOfferCartVisibility);
router.delete('/offers/:id', requirePermission('promotionsManagement', 'delete'), adminController.deleteAdminOffer);

// ----- Feedback Experience (Admin) -----
router.get('/feedback-experiences', requirePermission('customerManagement', 'view'), feedbackExperienceController.getFeedbackExperiences);
router.delete('/feedback-experiences/:id', requirePermission('customerManagement', 'delete'), feedbackExperienceController.deleteFeedbackExperience);

// ----- Fee Settings -----
router.get('/fee-settings', requirePermission('financialManagement', 'view'), adminController.getFeeSettings);
router.put('/fee-settings', requirePermission('financialManagement', 'edit'), adminController.createOrUpdateFeeSettings);

// ----- Referral Settings -----
router.get('/referral-settings', requirePermission('promotionsManagement', 'view'), adminController.getReferralSettings);
router.put('/referral-settings', requirePermission('promotionsManagement', 'edit'), adminController.createOrUpdateReferralSettings);

// ----- Business Settings -----
router.get('/business-settings', requirePermission('systemSettings', 'view'), businessSettingsController.getBusinessSettings);
router.patch('/business-settings', requirePermission('systemSettings', 'edit'), upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 },
    { name: 'termsAndConditionsPdf', maxCount: 1 }
]), businessSettingsController.updateBusinessSettings);

// ----- Delivery Cash Limit -----
router.get('/delivery-cash-limit', requirePermission('driverManagement', 'view'), adminController.getDeliveryCashLimit);
router.patch('/delivery-cash-limit', requirePermission('driverManagement', 'edit'), adminController.updateDeliveryCashLimit);

// ----- Delivery Emergency Help -----
router.get('/delivery-emergency-help', requirePermission('driverManagement', 'view'), adminController.getEmergencyHelp);
router.put('/delivery-emergency-help', requirePermission('driverManagement', 'edit'), adminController.createOrUpdateEmergencyHelp);

// ----- Withdrawals (admin) -----
router.get('/withdrawals', requirePermission('financialManagement', 'view'), adminController.getWithdrawals);
router.patch('/withdrawals/:id', requirePermission('financialManagement', 'edit'), adminController.updateWithdrawalStatus);
router.get('/delivery/withdrawals', requirePermission('financialManagement', 'view'), adminController.getDeliveryWithdrawals);
router.patch('/delivery/withdrawals/:id', requirePermission('financialManagement', 'edit'), adminController.updateDeliveryWithdrawalStatus);
router.get('/delivery/cash-limit-settlements', requirePermission('driverManagement', 'view'), adminController.getCashLimitSettlements);

// ----- Delivery partners & general -----
router.get('/delivery/order-fee-settings', requirePermission('driverManagement', 'view'), adminController.getDeliveryOrderFeeSettings);
router.post('/delivery/order-fee-settings', requirePermission('driverManagement', 'edit'), adminController.updateDeliveryOrderFeeSettings);
router.get('/delivery/commission-audit', requirePermission('driverManagement', 'view'), adminController.getDeliveryCommissionAudit);
router.get('/delivery/join-requests', requirePermission('driverManagement', 'view'), adminController.getDeliveryJoinRequests);
router.get('/delivery/available-partners', requirePermission('driverManagement', 'view'), adminController.getAvailableDeliveryPartners);
router.get('/delivery/wallets', requirePermission('financialManagement', 'view'), adminController.getDeliveryWallets);
router.get('/delivery/bonus-transactions', requirePermission('driverManagement', 'view'), adminController.getDeliveryPartnerBonusTransactions);
router.get('/delivery/earnings', requirePermission('driverManagement', 'view'), adminController.getDeliveryEarnings);
router.get('/delivery/earning-transactions', requirePermission('driverManagement', 'view'), adminController.getDeliveryEarningTransactions);
router.post('/delivery/bonus', requirePermission('driverManagement', 'create'), adminController.addDeliveryPartnerBonus);
router.get('/delivery/commission-rules', requirePermission('driverManagement', 'view'), adminController.getDeliveryCommissionRules);
router.post('/delivery/commission-rules', requirePermission('driverManagement', 'create'), adminController.createDeliveryCommissionRule);
router.patch('/delivery/commission-rules/:id', requirePermission('driverManagement', 'edit'), adminController.updateDeliveryCommissionRule);
router.delete('/delivery/commission-rules/:id', requirePermission('driverManagement', 'delete'), adminController.deleteDeliveryCommissionRule);
router.patch('/delivery/commission-rules/:id/status', requirePermission('driverManagement', 'edit'), adminController.toggleDeliveryCommissionRuleStatus);
router.get('/delivery/reviews', requirePermission('driverManagement', 'view'), adminController.getDeliverymanReviews);
router.get('/contact-messages', requirePermission('customerManagement', 'view'), adminController.getContactMessages);
router.get('/delivery/earning-addons', requirePermission('driverManagement', 'view'), adminController.getEarningAddons);
router.post('/delivery/earning-addons', requirePermission('driverManagement', 'create'), adminController.createEarningAddon);
router.patch('/delivery/earning-addons/:id', requirePermission('driverManagement', 'edit'), adminController.updateEarningAddon);
router.delete('/delivery/earning-addons/:id', requirePermission('driverManagement', 'delete'), adminController.deleteEarningAddon);
router.patch('/delivery/earning-addons/:id/status', requirePermission('driverManagement', 'edit'), adminController.toggleEarningAddonStatus);
router.get('/delivery/earning-addon-history', requirePermission('driverManagement', 'view'), adminController.getEarningAddonHistory);
router.post('/delivery/earning-addon-history/:id/credit', requirePermission('driverManagement', 'edit'), adminController.creditEarningToWallet);
router.post('/delivery/earning-addon-history/:id/cancel', requirePermission('driverManagement', 'edit'), adminController.cancelEarningAddonHistory);
router.post('/delivery/earning-addon-completions/check', requirePermission('driverManagement', 'view'), adminController.checkEarningAddonCompletions);
router.get('/delivery/support-tickets/stats', requirePermission('driverManagement', 'view'), adminController.getSupportTicketStats);
router.get('/delivery/support-tickets', requirePermission('driverManagement', 'view'), adminController.getSupportTickets);
router.patch('/delivery/support-tickets/:id', requirePermission('driverManagement', 'edit'), adminController.updateSupportTicket);
router.get('/delivery/partners', requirePermission('driverManagement', 'view'), adminController.getDeliveryPartners);
router.get('/delivery/:id', requirePermission('driverManagement', 'view'), adminController.getDeliveryPartnerById);
router.patch('/delivery/:id/approve', requirePermission('driverManagement', 'edit'), adminController.approveDeliveryPartner);
router.patch('/delivery/:id/reject', requirePermission('driverManagement', 'edit'), adminController.rejectDeliveryPartner);
router.patch('/delivery/:id/availability', requirePermission('driverManagement', 'edit'), adminController.updateDeliveryPartnerAvailabilityAdmin);
router.delete('/delivery/:id', requirePermission('driverManagement', 'delete'), adminController.deleteDeliveryPartner);
router.get('/delivery/:id/eligible-vendors', requirePermission('driverManagement', 'view'), adminController.getEligibleVendorsForDeliveryPartnerController);
router.patch('/delivery/:id/assignment', requirePermission('driverManagement', 'edit'), adminController.updateDeliveryPartnerAssignmentController);
// ----- Zones -----
router.get('/zones', requirePermission('zoneCityManagement', 'view'), adminController.getZones);
router.get('/zones/:id', requirePermission('zoneCityManagement', 'view'), adminController.getZoneById);
router.post('/zones', requirePermission('zoneCityManagement', 'create'), adminController.createZone);
router.patch('/zones/:id', requirePermission('zoneCityManagement', 'edit'), adminController.updateZone);
router.delete('/zones/:id', requirePermission('zoneCityManagement', 'delete'), adminController.deleteZone);

// Dining routes removed — not part of DailyMealBox PRD

// ----- Orders -----
router.post('/orders/manual', requirePermission('orderManagement', 'create'), prdAdminController.createManualOrder);
router.get('/orders', requirePermission('orderManagement', 'view'), orderController.listOrdersAdminController);
router.get('/orders/:orderId', requirePermission('orderManagement', 'view'), orderController.getOrderByIdAdminController);
router.delete('/orders/:orderId', requirePermission('orderManagement', 'delete'), orderController.deleteOrderAdminController);
router.post('/orders/:orderId/assign-delivery', requirePermission('orderManagement', 'edit'), orderController.assignDeliveryPartnerController);

// ----- CMS Pages (About + legal) -----
router.get('/pages-social-media/:key', requirePermission('otaContent', 'view'), getAdminPageController);
router.put('/pages-social-media/:key', requirePermission('otaContent', 'edit'), upsertAdminPageController);

router.get('/sidebar-badges', adminController.getSidebarBadges);
router.get('/notifications/fssai-expired', requirePermission('vendorManagement', 'view'), adminController.getExpiredFssaiNotifications);

// ----- Live Monitor -----
router.get('/live-monitor/status', requirePermission('dashboard', 'view'), liveMonitorController.getLiveMonitorStatus);

// ----- App Intro & Ads -----
router.get('/app-intro-ads', requirePermission('promotionsManagement', 'view'), appIntroAdController.getAppIntroAds);
router.post('/app-intro-ads', requirePermission('promotionsManagement', 'create'), upload.fields([{ name: 'media', maxCount: 1 }]), appIntroAdController.createAppIntroAd);
router.patch('/app-intro-ads/order', requirePermission('promotionsManagement', 'edit'), appIntroAdController.updateAppIntroAdsOrder);
router.patch('/app-intro-ads/:id', requirePermission('promotionsManagement', 'edit'), upload.fields([{ name: 'media', maxCount: 1 }]), appIntroAdController.updateAppIntroAd);
router.patch('/app-intro-ads/:id/toggle', requirePermission('promotionsManagement', 'edit'), appIntroAdController.toggleAppIntroAdStatus);
router.delete('/app-intro-ads/:id', requirePermission('promotionsManagement', 'delete'), appIntroAdController.deleteAppIntroAd);

// ----- Vendor Subscription Plans -----
router.get('/vendor-subscription-plans', requirePermission('vendorManagement', 'view'), adminController.getVendorSubscriptionPlans);
router.post('/vendor-subscription-plans', requirePermission('vendorManagement', 'create'), adminController.createVendorSubscriptionPlan);
router.put('/vendor-subscription-plans/:id', requirePermission('vendorManagement', 'edit'), adminController.updateVendorSubscriptionPlan);
router.delete('/vendor-subscription-plans/:id', requirePermission('vendorManagement', 'delete'), adminController.deleteVendorSubscriptionPlan);

// ----- Vendor Timing Settings -----
router.get('/vendor-timing-settings', requirePermission('vendorManagement', 'view'), adminController.getVendorTimingSettingsController);
router.put('/vendor-timing-settings', requirePermission('vendorManagement', 'edit'), adminController.updateVendorTimingSettingsController);

// ----- Vendor Subscribers -----
router.get('/subscribers', requirePermission('vendorManagement', 'view'), adminController.getAllSubscribersController);
router.get('/subscribers/summary', requirePermission('vendorManagement', 'view'), adminController.getAllSubscribersSummaryController);

router.get('/vendors/:id/subscribers', requirePermission('vendorManagement', 'view'), adminController.getVendorSubscribersController);
router.get('/vendors/:id/subscribers/summary', requirePermission('vendorManagement', 'view'), adminController.getVendorSubscribersSummaryController);
router.get('/vendors/:id/subscribers/:subId', requirePermission('vendorManagement', 'view'), adminController.getVendorSubscriberDetailsController);

// ----- Kitchen Partners -----
router.use('/kitchen-partners', kitchenPartnerRoutes);

// ----- Office Approvals -----
router.get('/office-companies', requirePermission('dashboard', 'view'), officeCompanyApprovalController.getOfficeCompanies);
router.put('/office-companies/:id/approve', requirePermission('dashboard', 'edit'), officeCompanyApprovalController.approveOfficeCompany);
router.put('/office-companies/:id/reject', requirePermission('dashboard', 'edit'), officeCompanyApprovalController.rejectOfficeCompany);

export default router;
