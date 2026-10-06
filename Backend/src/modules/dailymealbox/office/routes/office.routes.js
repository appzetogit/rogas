import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
    getEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getVendors,
    assignMealPlan,
    quoteAssignmentOrder,
    createAssignmentOrder,
    getAssignments,
    deleteAssignment,
    getCompanyDetails,
    updateCompanyDetails,
    getOnboardingStatus,
    startOnboarding,
    updateOnboardingStep,
    completeOnboarding,
    getPayments,
    deactivateCompanyAccount,
    lookupCompanyByNip
} from '../controllers/office.controller.js';

const router = express.Router();

// Office accounts only (a customer, vendor or driver token must not reach these).
router.use(authMiddleware, requireRoles('OFFICE_ADMIN'));

// Employees
router.get('/employees', getEmployees);
router.post('/employees', addEmployee);
router.put('/employees/:id', updateEmployee);
router.delete('/employees/:id', deleteEmployee);

// Vendors & Assignments
router.get('/vendors', getVendors);
router.get('/assignments', getAssignments);
router.post('/assignments/quote', quoteAssignmentOrder);
router.post('/assignments/create-order', createAssignmentOrder);
router.post('/assignments', assignMealPlan);
router.delete('/assignments/:id', deleteAssignment);

// Payments
router.get('/payments', getPayments);

// Company Details
router.get('/company', getCompanyDetails);
router.put('/company', updateCompanyDetails);
router.put('/company/deactivate', deactivateCompanyAccount);

// Onboarding
router.get('/nip-lookup/:nip', lookupCompanyByNip);
router.get('/onboarding/status', getOnboardingStatus);
router.post('/onboarding/start', startOnboarding);
router.put('/onboarding/step/:step', updateOnboardingStep);
router.post('/onboarding/complete', completeOnboarding);

export default router;
