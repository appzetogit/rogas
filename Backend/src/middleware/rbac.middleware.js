import { FoodAdmin } from '../core/admin/admin.model.js';
import { sendError } from '../utils/response.js';

/**
 * RBAC Middleware Factory
 * 
 * Creates a middleware that checks whether the logged-in admin has the
 * required permission (module + action) based on their assigned custom role.
 *
 * Rules:
 *  - SUPER_ADMIN adminRole → always allowed (bypass).
 *  - Custom roleId present → checks roleId.permissions[module][action].
 *  - Legacy PRD roles without roleId → allowed (preserves existing behavior).
 *
 * @param {string} module  - Permission module key, e.g. 'vendorManagement'
 * @param {string} action  - Permission action: 'view' | 'create' | 'edit' | 'delete'
 * @returns {Function} Express middleware
 */
export function requirePermission(module, action) {
    return async (req, res, next) => {
        try {
            const userId = req.user?.userId || req.user?._id;
            if (!userId) {
                return sendError(res, 401, 'Authentication required');
            }

            // Fetch admin with roleId populated
            const admin = await FoodAdmin.findById(userId)
                .populate('roleId')
                .select('adminRole roleId')
                .lean();

            if (!admin) {
                return sendError(res, 401, 'Admin user not found');
            }

            // SUPER_ADMIN always bypasses
            if (admin.adminRole === 'SUPER_ADMIN') {
                return next();
            }

            // If admin has a custom roleId assigned, enforce its permissions
            if (admin.roleId && admin.roleId.permissions) {
                const modulePerms = admin.roleId.permissions[module];
                if (modulePerms && modulePerms[action] === true) {
                    return next();
                }
                return sendError(res, 403, `Access denied: You do not have '${action}' permission for '${module}'.`);
            }

            // Legacy PRD role (no custom roleId) → allow through 
            // to preserve existing behavior
            return next();
        } catch (error) {
            console.error('[RBAC] Permission check error:', error);
            return sendError(res, 500, 'Permission check failed');
        }
    };
}
