import { FoodAdmin } from '../admin/admin.model.js';
import { sendError } from '../../utils/response.js';

/**
 * Middleware to enforce Role-Based Access Control (RBAC).
 * 
 * @param {string} moduleName - The name of the module (e.g., 'dashboard', 'customerManagement').
 * @param {string} action - The required action ('view', 'create', 'edit', 'delete').
 */
export const requirePermission = (moduleName, action) => {
    return async (req, res, next) => {
        try {
            if (!req.user || req.user.role !== 'ADMIN') {
                return sendError(res, 403, 'Admin access required');
            }
            
            // Note: Since this queries the DB, we cache the admin document in req.adminProfile
            const admin = req.adminProfile || await FoodAdmin.findById(req.user.userId).populate('roleId').lean();
            if (!admin || !admin.isActive) {
                return sendError(res, 403, 'Admin inactive or not found');
            }
            
            req.adminProfile = admin; // Attach for downstream use

            // SUPER_ADMIN always has full access
            if (admin.adminRole === 'SUPER_ADMIN') {
                return next();
            }

            // If a dynamic Role is assigned, strictly enforce it
            if (admin.roleId) {
                const perms = admin.roleId.permissions;
                if (perms && perms[moduleName] && perms[moduleName][action] === true) {
                    return next();
                }
                return sendError(res, 403, 'Access denied: insufficient permissions');
            }

            // Fallback for backward compatibility with legacy PRD roles.
            // If they don't have a dynamic role assigned, we let them pass the *new* middleware
            // so we don't break existing functionality. Their permissions will be managed by existing logic.
            if (admin.adminRole) {
                return next();
            }

            return sendError(res, 403, 'Access denied: no permissions assigned');
        } catch (error) {
            next(error);
        }
    };
};
