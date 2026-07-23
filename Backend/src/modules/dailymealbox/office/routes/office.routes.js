import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import {
    getEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getVendors,
    assignMealPlan,
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
    deactivateCompanyAccount
} from '../controllers/office.controller.js';

const router = express.Router();

// Require all office routes to be authenticated
router.use(authMiddleware);

// Employees
router.get('/employees', getEmployees);
router.post('/employees', addEmployee);
router.put('/employees/:id', updateEmployee);
router.delete('/employees/:id', deleteEmployee);

// Vendors & Assignments
router.get('/vendors', getVendors);
router.get('/assignments', getAssignments);
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
router.get('/onboarding/status', getOnboardingStatus);
router.post('/onboarding/start', startOnboarding);
router.put('/onboarding/step/:step', updateOnboardingStep);
router.post('/onboarding/complete', completeOnboarding);

export default router;
