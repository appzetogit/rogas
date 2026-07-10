import { useMemo } from 'react';

/**
 * Maps sidebar/page context to permission module keys.
 * Use these keys when calling hasPermission().
 */
export const MODULES = {
  DASHBOARD: 'dashboard',
  VENDOR_MANAGEMENT: 'vendorManagement',
  DRIVER_MANAGEMENT: 'driverManagement',
  CUSTOMER_MANAGEMENT: 'customerManagement',
  KITCHEN_PARTNERS: 'kitchenPartners',
  ROLES_EMPLOYEES: 'rolesEmployees',
  COMPLAINTS_REFUNDS: 'complaintsRefunds',
  ORDER_MANAGEMENT: 'orderManagement',
  FOOD_MANAGEMENT: 'foodManagement',
  FLEET_MANAGEMENT: 'fleetManagement',
  ZONE_CITY_MANAGEMENT: 'zoneCityManagement',
  PROMOTIONS_MANAGEMENT: 'promotionsManagement',
  FINANCIAL_MANAGEMENT: 'financialManagement',
  REPORTS: 'reports',
  FEATURE_FLAGS: 'featureFlags',
  OTA_CONTENT: 'otaContent',
  SYSTEM_SETTINGS: 'systemSettings',
};

/**
 * Hook that reads the current admin's permissions from localStorage
 * and provides a hasPermission(module, action) checker.
 *
 * Usage:
 *   const { hasPermission, isSuperAdmin } = usePermissions();
 *   if (hasPermission('vendorManagement', 'create')) { ... }
 */
export function usePermissions() {
  const { isSuperAdmin, permissions, adminRole } = useMemo(() => {
    try {
      const userStr = localStorage.getItem('admin_user');
      if (userStr) {
        const user = JSON.parse(userStr);
        return {
          isSuperAdmin: user.adminRole === 'SUPER_ADMIN',
          permissions: user.roleId?.permissions || null,
          adminRole: user.adminRole || 'SUPER_ADMIN',
        };
      }
    } catch (e) { /* ignore */ }
    return { isSuperAdmin: true, permissions: null, adminRole: 'SUPER_ADMIN' };
  }, []);

  /**
   * Check if the current admin has the given permission.
   * @param {string} module - e.g. 'vendorManagement'
   * @param {string} action - 'view' | 'create' | 'edit' | 'delete'
   * @returns {boolean}
   */
  const hasPermission = (module, action) => {
    // Super admin can do everything
    if (isSuperAdmin) return true;

    // Custom role with permissions matrix
    if (permissions) {
      return permissions[module]?.[action] === true;
    }

    // Legacy PRD role (no custom roleId) → allow all actions
    // This preserves backward compatibility
    return true;
  };

  return { hasPermission, isSuperAdmin, adminRole };
}

/**
 * Declarative permission gate component.
 * Renders children only if the current admin has the required permission.
 *
 * Usage:
 *   <Can module="vendorManagement" action="create">
 *     <button>Add Vendor</button>
 *   </Can>
 *
 *   <Can module="vendorManagement" action="delete" fallback={<span>No access</span>}>
 *     <button>Delete</button>
 *   </Can>
 */
export function Can({ module, action, children, fallback = null }) {
  const { hasPermission } = usePermissions();
  return hasPermission(module, action) ? children : fallback;
}
