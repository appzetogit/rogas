import { Router } from 'express';
import { 
    createRole, 
    getRoles, 
    getRoleById, 
    updateRole, 
    deleteRole 
} from '../controllers/role.controller.js';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requirePermission } from '../../../../middleware/rbac.middleware.js';

const router = Router();

router.use(authMiddleware);

// RBAC-protected role management routes
router.get('/', requirePermission('rolesEmployees', 'view'), getRoles);
router.get('/:id', requirePermission('rolesEmployees', 'view'), getRoleById);
router.post('/', requirePermission('rolesEmployees', 'create'), createRole);
router.put('/:id', requirePermission('rolesEmployees', 'edit'), updateRole);
router.delete('/:id', requirePermission('rolesEmployees', 'delete'), deleteRole);

export default router;
