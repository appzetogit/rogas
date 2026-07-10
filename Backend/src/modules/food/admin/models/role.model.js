import mongoose from 'mongoose';

const permissionSchema = new mongoose.Schema({
    view: { type: Boolean, default: false },
    create: { type: Boolean, default: false },
    edit: { type: Boolean, default: false },
    delete: { type: Boolean, default: false }
}, { _id: false });

const roleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    description: {
        type: String,
        trim: true,
        default: ''
    },
    permissions: {
        dashboard: { type: permissionSchema, default: () => ({}) },
        vendorManagement: { type: permissionSchema, default: () => ({}) },
        driverManagement: { type: permissionSchema, default: () => ({}) },
        customerManagement: { type: permissionSchema, default: () => ({}) },
        kitchenPartners: { type: permissionSchema, default: () => ({}) },
        rolesEmployees: { type: permissionSchema, default: () => ({}) },
        complaintsRefunds: { type: permissionSchema, default: () => ({}) },
        orderManagement: { type: permissionSchema, default: () => ({}) },
        foodManagement: { type: permissionSchema, default: () => ({}) },
        fleetManagement: { type: permissionSchema, default: () => ({}) },
        zoneCityManagement: { type: permissionSchema, default: () => ({}) },
        promotionsManagement: { type: permissionSchema, default: () => ({}) },
        financialManagement: { type: permissionSchema, default: () => ({}) },
        reports: { type: permissionSchema, default: () => ({}) },
        featureFlags: { type: permissionSchema, default: () => ({}) },
        otaContent: { type: permissionSchema, default: () => ({}) },
        systemSettings: { type: permissionSchema, default: () => ({}) }
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FoodAdmin'
    }
}, {
    collection: 'food_admin_roles',
    timestamps: true
});

export const AdminRole = mongoose.model('AdminRole', roleSchema);
