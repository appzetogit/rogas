import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { config } from '../../config/env.js';
import { ADMIN_PRD_ROLES } from '../../modules/food/admin/constants/adminPrd.js';

const adminSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: true
        },
        name: { type: String, trim: true, default: '' },
        phone: { type: String, trim: true, default: '' },
        profileImage: { type: String, trim: true, default: '' },
        fcmTokens: {
            type: [String],
            default: []
        },
        fcmTokenMobile: {
            type: [String],
            default: []
        },
        role: {
            type: String,
            default: 'ADMIN'
        },
        adminRole: {
            type: String,
            enum: ADMIN_PRD_ROLES,
            default: 'CUSTOMER_SERVICE',
            index: true
        },
        roleId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AdminRole'
        },
        assignedCityIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'AdminCity'
        }],
        permissions: {
            type: [String],
            default: []
        },
        isActive: {
            type: Boolean,
            default: true
        },
        servicesAccess: {
            type: [String],
            enum: ['food', 'quickCommerce', 'taxi'],
            default: ['food']
        }
    },
    {
        collection: 'food_admins',
        timestamps: true
    }
);

adminSchema.index({ servicesAccess: 1 });
adminSchema.index({ adminRole: 1, isActive: 1 });

adminSchema.pre('save', async function (next) {
    if (!this.isModified('password')) {
        return next();
    }

    const salt = await bcrypt.genSalt(config.bcryptSaltRounds);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

adminSchema.methods.comparePassword = function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

export const FoodAdmin = mongoose.model('FoodAdmin', adminSchema);

