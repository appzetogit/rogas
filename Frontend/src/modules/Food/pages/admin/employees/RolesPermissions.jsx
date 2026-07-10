import React, { useState, useEffect } from 'react';
import { adminClient } from "@food/api/axios";
import { toast } from 'sonner';
import { Can } from "@food/hooks/usePermissions";

const modulesList = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'vendorManagement', label: 'Vendor Management' },
    { key: 'driverManagement', label: 'Driver Management' },
    { key: 'customerManagement', label: 'Customer Management' },
    { key: 'kitchenPartners', label: 'Kitchen Partners' },
    { key: 'rolesEmployees', label: 'Roles Employees' },
    { key: 'complaintsRefunds', label: 'Complaints Refunds' },
    { key: 'orderManagement', label: 'Order Management' },
    { key: 'foodManagement', label: 'Food Management' },
    { key: 'fleetManagement', label: 'Fleet Management' },
    { key: 'zoneCityManagement', label: 'Zone City Management' },
    { key: 'promotionsManagement', label: 'Promotions Management' },
    { key: 'financialManagement', label: 'Financial Management' },
    { key: 'reports', label: 'Reports' },
    { key: 'featureFlags', label: 'Feature Flags' },
    { key: 'otaContent', label: 'OTA Content' },
    { key: 'systemSettings', label: 'System Settings' }
];

export default function RolesPermissions() {
    const [roles, setRoles] = useState([]);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [editingRole, setEditingRole] = useState(null);
    const [loading, setLoading] = useState(false);

    const initialPermissions = modulesList.reduce((acc, mod) => {
        acc[mod.key] = { view: false, create: false, edit: false, delete: false };
        return acc;
    }, {});

    const [formData, setFormData] = useState({
        name: '',
        permissions: initialPermissions
    });

    useEffect(() => {
        fetchRoles();
    }, []);

    const fetchRoles = async () => {
        setLoading(true);
        try {
            const res = await adminClient.get('/food/admin/custom-roles');
            if (res?.data?.success) {
                setRoles(res.data.data.roles);
            }
        } catch (error) {
            console.error(error);
            toast.error('Failed to fetch roles');
        } finally {
            setLoading(false);
        }
    };

    const handlePermissionChange = (moduleKey, action) => {
        setFormData(prev => ({
            ...prev,
            permissions: {
                ...prev.permissions,
                [moduleKey]: {
                    ...prev.permissions[moduleKey],
                    [action]: !prev.permissions[moduleKey][action]
                }
            }
        }));
    };

    const handleSelectAllAction = (action, value) => {
        setFormData(prev => {
            const newPerms = { ...prev.permissions };
            modulesList.forEach(mod => {
                newPerms[mod.key] = { ...newPerms[mod.key], [action]: value };
            });
            return { ...prev, permissions: newPerms };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name) {
            toast.error('Role name is required');
            return;
        }

        try {
            const url = editingRole 
                ? `/food/admin/custom-roles/${editingRole._id}`
                : `/food/admin/custom-roles`;
            const method = editingRole ? 'put' : 'post';

            const res = await adminClient({
                method,
                url,
                data: formData
            });

            if (res?.data?.success) {
                toast.success(`Role ${editingRole ? 'updated' : 'created'} successfully`);
                setIsFormVisible(false);
                fetchRoles();
            }
        } catch (error) {
            toast.error(error.response?.data?.message || 'Failed to save role');
        }
    };

    const handleDelete = async (roleId) => {
        if (!window.confirm('Are you sure you want to delete this role?')) return;
        try {
            const res = await adminClient.delete(`/food/admin/custom-roles/${roleId}`);
            if (res?.data?.success) {
                toast.success('Role deleted successfully');
                fetchRoles();
            }
        } catch (error) {
            toast.error('Failed to delete role');
        }
    };

    const openCreateForm = () => {
        setEditingRole(null);
        setFormData({ name: '', permissions: initialPermissions });
        setIsFormVisible(true);
    };

    const openEditForm = (role) => {
        setEditingRole(role);
        setFormData({
            name: role.name,
            permissions: { ...initialPermissions, ...role.permissions }
        });
        setIsFormVisible(true);
    };

    if (isFormVisible) {
        return (
            <div className="p-6 bg-gray-50 min-h-screen">
                <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-sm p-6 border border-gray-100">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-semibold text-gray-800">
                            {editingRole ? 'Edit Role' : 'Create New Role'}
                        </h2>
                        <button 
                            onClick={() => setIsFormVisible(false)}
                            className="text-gray-500 hover:text-gray-700"
                        >
                            Cancel
                        </button>
                    </div>

                    <form onSubmit={handleSubmit}>
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Role Name</label>
                            <input 
                                type="text"
                                className="w-full md:w-1/3 border border-gray-300 rounded-md p-2 focus:ring-[#f57224] focus:border-[#f57224]"
                                value={formData.name}
                                onChange={(e) => setFormData({...formData, name: e.target.value})}
                                placeholder="e.g. Area Manager"
                                required
                            />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-600 text-sm">
                                        <th className="p-3 border-b font-semibold">Module</th>
                                        <th className="p-3 border-b font-semibold text-center">
                                            <div>View</div>
                                            <input type="checkbox" onChange={(e) => handleSelectAllAction('view', e.target.checked)} />
                                        </th>
                                        <th className="p-3 border-b font-semibold text-center">
                                            <div>Create</div>
                                            <input type="checkbox" onChange={(e) => handleSelectAllAction('create', e.target.checked)} />
                                        </th>
                                        <th className="p-3 border-b font-semibold text-center">
                                            <div>Edit</div>
                                            <input type="checkbox" onChange={(e) => handleSelectAllAction('edit', e.target.checked)} />
                                        </th>
                                        <th className="p-3 border-b font-semibold text-center">
                                            <div>Delete</div>
                                            <input type="checkbox" onChange={(e) => handleSelectAllAction('delete', e.target.checked)} />
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {modulesList.map((mod, idx) => (
                                        <tr key={mod.key} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                            <td className="p-3 border-b font-medium text-sm text-gray-700">{mod.label}</td>
                                            {['view', 'create', 'edit', 'delete'].map(action => (
                                                <td key={action} className="p-3 border-b text-center">
                                                    <input 
                                                        type="checkbox"
                                                        className="h-4 w-4 text-[#f57224] focus:ring-[#f57224] border-gray-300 rounded"
                                                        checked={formData.permissions[mod.key]?.[action] || false}
                                                        onChange={() => handlePermissionChange(mod.key, action)}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        <div className="mt-8 flex justify-end">
                            <button 
                                type="submit"
                                className="bg-[#f57224] text-white px-6 py-2 rounded-md hover:bg-[#e06117] transition-colors shadow-sm"
                            >
                                {editingRole ? 'Update Role' : 'Save Role'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    return (
        <div className="p-6 bg-gray-50 min-h-screen">
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-2xl font-semibold text-gray-800">Roles & Permissions</h1>
                <Can module="rolesEmployees" action="create">
                    <button 
                        onClick={openCreateForm}
                        className="bg-[#f57224] text-white px-4 py-2 rounded shadow-sm hover:bg-[#e06117] transition-colors"
                    >
                        + Add New Role
                    </button>
                </Can>
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-100 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-100 text-gray-600 text-sm">
                        <tr>
                            <th className="p-4 font-semibold">Role Name</th>
                            <th className="p-4 font-semibold">Status</th>
                            <th className="p-4 font-semibold">Created At</th>
                            <th className="p-4 font-semibold text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="4" className="text-center p-4 text-gray-500">Loading roles...</td>
                            </tr>
                        ) : roles.length === 0 ? (
                            <tr>
                                <td colSpan="4" className="text-center p-4 text-gray-500">No roles found. Create one!</td>
                            </tr>
                        ) : (
                            roles.map(role => (
                                <tr key={role._id} className="border-t border-gray-50 hover:bg-gray-50">
                                    <td className="p-4 text-gray-800 font-medium">{role.name}</td>
                                    <td className="p-4">
                                        <span className={`px-2 py-1 text-xs rounded-full ${role.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                            {role.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </td>
                                    <td className="p-4 text-sm text-gray-500">
                                        {new Date(role.createdAt).toLocaleDateString()}
                                    </td>
                                    <td className="p-4 text-right flex justify-end gap-2">
                                        <Can module="rolesEmployees" action="edit">
                                            <button 
                                                onClick={() => openEditForm(role)}
                                                className="text-blue-500 hover:text-blue-700 border border-blue-200 px-3 py-1 rounded text-sm"
                                            >
                                                Edit
                                            </button>
                                        </Can>
                                        <Can module="rolesEmployees" action="delete">
                                            <button 
                                                onClick={() => handleDelete(role._id)}
                                                className="text-red-500 hover:text-red-700 border border-red-200 px-3 py-1 rounded text-sm"
                                            >
                                                Delete
                                            </button>
                                        </Can>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
