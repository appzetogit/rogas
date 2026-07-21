import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Assuming standard models export structure
import { OfficeEmployee } from '../src/modules/dailymealbox/office/models/officeEmployee.model.js';
import { FoodUser } from '../src/core/users/user.model.js';
import { DMBSubscription } from '../src/modules/dailymealbox/subscription/subscription.model.js';

const isDryRun = !process.argv.includes('--apply');

async function migrate() {
    console.log('====================================================');
    console.log('      EMPLOYEE -> FOOD USER MIGRATION SCRIPT      ');
    console.log('====================================================');
    if (isDryRun) {
        console.log('MODE: DRY RUN (No changes will be saved to DB)');
        console.log('To apply changes, run with --apply flag.');
    } else {
        console.log('MODE: APPLY (Changes will be written to DB)');
        console.log('⚠️  WARNING: PLEASE ENSURE YOU HAVE TAKEN A DB BACKUP BEFORE PROCEEDING! ⚠️');
    }
    console.log('====================================================\n');

    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to Database.\n');

        const employees = await OfficeEmployee.find({});
        console.log(`Found ${employees.length} office employees to check.\n`);

        let updatedCount = 0;
        let createdCount = 0;
        let alreadyValidCount = 0;

        for (const emp of employees) {
            let userValid = false;

            // Check if existing userId is valid
            if (emp.userId) {
                const existingUser = await FoodUser.findById(emp.userId);
                if (existingUser) {
                    userValid = true;
                    alreadyValidCount++;
                    
                    // We might still want to ensure role is EMPLOYEE and companyId is set
                    let needsSave = false;
                    if (existingUser.role !== 'EMPLOYEE') {
                        existingUser.role = 'EMPLOYEE';
                        needsSave = true;
                    }
                    if (!existingUser.companyId && emp.companyId) {
                        existingUser.companyId = emp.companyId;
                        needsSave = true;
                    }

                    if (needsSave) {
                        console.log(`[UPDATE] User ${existingUser._id} (Phone: ${existingUser.phone}) role->EMPLOYEE, companyId->${emp.companyId}`);
                        if (!isDryRun) {
                            await existingUser.save();
                        }
                    }
                }
            }

            if (!userValid) {
                console.log(`[FIX NEEDED] Employee ${emp._id} (${emp.name}, Phone: ${emp.phone}) has invalid/missing userId: ${emp.userId}`);
                
                // Attempt to find by phone
                let foodUser = null;
                if (emp.phone) {
                    const digits = String(emp.phone).replace(/\D/g, '');
                    foodUser = await FoodUser.findOne({
                        $or: [
                            { phone: emp.phone },
                            { phone: digits },
                            { phone: { $regex: new RegExp(digits.slice(-10) + '$') } }
                        ]
                    });
                }

                if (foodUser) {
                    console.log(`  -> Found existing FoodUser by phone: ${foodUser._id}. Linking...`);
                    if (!isDryRun) {
                        emp.userId = foodUser._id;
                        await emp.save();
                        
                        foodUser.role = 'EMPLOYEE';
                        foodUser.companyId = emp.companyId;
                        await foodUser.save();
                    }
                    updatedCount++;
                } else {
                    console.log(`  -> No existing FoodUser found. Creating new FoodUser...`);
                    if (!isDryRun) {
                        const newFoodUsers = await FoodUser.create([{
                            phone: emp.phone || `NO_PHONE_${emp._id}`,
                            name: emp.name || '',
                            email: emp.email || '',
                            role: 'EMPLOYEE',
                            companyId: emp.companyId,
                            isVerified: true,
                            isActive: true,
                            subscriptionStatus: emp.subscriptionStatus || 'none'
                        }]);
                        const newUser = newFoodUsers[0];
                        emp.userId = newUser._id;
                        await emp.save();
                        console.log(`  -> Created new FoodUser: ${newUser._id} and linked.`);
                    }
                    createdCount++;
                }

                // Update subscriptions linked to this employee
                if (!isDryRun && emp.userId) {
                    // Find all office subscriptions for this company and phone, or just fix broken ones?
                    // The easiest way is to find subscriptions where source is 'office' and it lacks proper userId,
                    // but we don't easily know which subscription belonged to this employee except by phone or old userId.
                    // If it had an old invalid userId, we update it:
                    const oldUserId = emp.userId; // wait, emp.userId was just updated.
                    // Actually, if DMBSubscription was created with `emp._id` mistakenly as userId (a common bug):
                    const badSubs = await DMBSubscription.find({ userId: emp._id, source: 'office' });
                    for (const sub of badSubs) {
                        sub.userId = emp.userId; // The new valid FoodUser._id
                        await sub.save();
                        console.log(`  -> Fixed subscription ${sub._id} to point to new FoodUser ${emp.userId}`);
                    }
                }
            }
        }

        console.log('\n====================================================');
        console.log('MIGRATION SUMMARY');
        console.log('====================================================');
        console.log(`Already Valid: ${alreadyValidCount}`);
        console.log(`Linked to Existing Users: ${updatedCount}`);
        console.log(`Created New Users: ${createdCount}`);
        console.log('====================================================');

    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from Database.');
    }
}

migrate();
