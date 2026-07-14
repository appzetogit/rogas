import express from 'express';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import {
    getEmployees,
    addEmployee,
    updateEmployee,
    deleteEmployee,
    getVendors,
    assignMeals,
    getAssignments,
    deleteAssignment,
    getCompanyDetails,
    updateCompanyDetails
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
router.post('/assignments', assignMeals);
router.delete('/assignments/:id', deleteAssignment);

// Company Details
router.get('/company', getCompanyDetails);
router.put('/company', updateCompanyDetails);

export default router;
