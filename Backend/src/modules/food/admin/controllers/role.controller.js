import { AdminRole } from '../models/role.model.js';
import { sendResponse, sendError } from '../../../../utils/response.js';

export const createRole = async (req, res, next) => {
    try {
        const { name, description, permissions } = req.body;
        if (!name) {
            return sendError(res, 400, 'Role name is required');
        }

        const existing = await AdminRole.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
        if (existing) {
            return sendError(res, 400, 'Role with this name already exists');
        }

        const role = await AdminRole.create({
            name,
            description,
            permissions,
            createdBy: req.user?.userId
        });

        return sendResponse(res, 201, 'Role created successfully', { role });
    } catch (error) {
        next(error);
    }
};

export const getRoles = async (req, res, next) => {
    try {
        const filter = {};
        if (req.query.search) {
            filter.name = { $regex: req.query.search, $options: 'i' };
        }
        
        const roles = await AdminRole.find(filter).sort({ createdAt: -1 }).lean();
        return sendResponse(res, 200, 'Roles fetched successfully', { roles });
    } catch (error) {
        next(error);
    }
};

export const getRoleById = async (req, res, next) => {
    try {
        const role = await AdminRole.findById(req.params.id).lean();
        if (!role) {
            return sendError(res, 404, 'Role not found');
        }
        return sendResponse(res, 200, 'Role fetched successfully', { role });
    } catch (error) {
        next(error);
    }
};

export const updateRole = async (req, res, next) => {
    try {
        const { name, description, permissions, isActive } = req.body;
        
        const role = await AdminRole.findById(req.params.id);
        if (!role) {
            return sendError(res, 404, 'Role not found');
        }

        if (name && name !== role.name) {
            const existing = await AdminRole.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') }, _id: { $ne: role._id } });
            if (existing) {
                return sendError(res, 400, 'Role with this name already exists');
            }
            role.name = name;
        }

        if (description !== undefined) role.description = description;
        if (permissions !== undefined) role.permissions = permissions;
        if (isActive !== undefined) role.isActive = isActive;

        await role.save();
        return sendResponse(res, 200, 'Role updated successfully', { role });
    } catch (error) {
        next(error);
    }
};

export const deleteRole = async (req, res, next) => {
    try {
        const role = await AdminRole.findById(req.params.id);
        if (!role) {
            return sendError(res, 404, 'Role not found');
        }
        await AdminRole.findByIdAndDelete(req.params.id);
        return sendResponse(res, 200, 'Role deleted successfully');
    } catch (error) {
        next(error);
    }
};
