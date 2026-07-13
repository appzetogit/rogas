import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { FoodAdmin } from './src/core/admin/admin.model.js';
import { AdminRole } from './src/modules/food/admin/models/role.model.js';

dotenv.config();

const createAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Create Super Admin Role
        const allPermissions = { view: true, create: true, edit: true, delete: true };
        let superAdminRole = await AdminRole.findOne({ name: 'Super Admin' });

        if (!superAdminRole) {
            superAdminRole = new AdminRole({
                name: 'Super Admin',
                description: 'Full access to all modules',
                permissions: {
                    dashboard: allPermissions,
                    vendorManagement: allPermissions,
                    driverManagement: allPermissions,
                    customerManagement: allPermissions,
                    kitchenPartners: allPermissions,
                    rolesEmployees: allPermissions,
                    complaintsRefunds: allPermissions,
                    orderManagement: allPermissions,
                    foodManagement: allPermissions,
                    fleetManagement: allPermissions,
                    zoneCityManagement: allPermissions,
                    promotionsManagement: allPermissions,
                    financialManagement: allPermissions,
                    reports: allPermissions,
                    featureFlags: allPermissions,
                    otaContent: allPermissions,
                    systemSettings: allPermissions
                },
                isActive: true
            });
            await superAdminRole.save();
            console.log('Super Admin role created.');
        } else {
            console.log('Super Admin role already exists.');
        }

        // Create Super Admin User
        const adminEmail = 'admin@gmail.com';
        let adminUser = await FoodAdmin.findOne({ email: adminEmail });

        if (!adminUser) {
            adminUser = new FoodAdmin({
                email: adminEmail,
                password: '123456',
                name: 'Super Admin',
                phone: '1234567890',
                role: 'ADMIN',
                adminRole: 'SUPER_ADMIN',
                roleId: superAdminRole._id,
                permissions: ['*'],
                isActive: true
            });
            await adminUser.save();
            console.log(`Admin user created! Email: ${adminEmail}, Password: password123`);
        } else {
            adminUser.roleId = superAdminRole._id;
            adminUser.role = 'ADMIN';
            adminUser.adminRole = 'SUPER_ADMIN';
            adminUser.permissions = ['*'];
            // If you want to reset password:
            // adminUser.password = 'password123';
            await adminUser.save();
            console.log(`Admin user already exists and has been updated. Email: ${adminEmail}`);
        }

    } catch (error) {
        console.error('Error creating admin:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from MongoDB');
    }
};

createAdmin();
