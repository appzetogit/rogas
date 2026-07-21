import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(uri).then(async () => {
    const subCol = mongoose.connection.collection('dmb_subscriptions');
    const planCol = mongoose.connection.collection('dmb_meal_plans');
    
    // Find ALL office subscriptions
    const allSubs = await subCol.find({ source: 'office' }).toArray();
    console.log(`Found ${allSubs.length} office subscriptions`);
    
    let fixed = 0;
    for (const sub of allSubs) {
        if (sub.mealPlanId) {
            const plan = await planCol.findOne({ _id: sub.mealPlanId });
            if (plan) {
                const pricePerDay = plan.pricePerDay || 0;
                const totalMonthlyPrice = pricePerDay * 22;
                
                const updateObj = {
                    $set: {
                        "pricing.basePricePerDay": pricePerDay,
                        "pricing.totalPrice": totalMonthlyPrice,
                        "meals": [{ mealPlanId: sub.mealPlanId, quantity: 1 }]
                    }
                };
                
                // Fix delivery slots
                if (!sub.deliverySlots || sub.deliverySlots.length === 0) {
                    if (sub.deliverySlot) {
                        updateObj.$set.deliverySlots = [sub.deliverySlot];
                    }
                }
                
                await subCol.updateOne({ _id: sub._id }, updateObj);
                fixed++;
            } else {
                console.log(`Meal plan ${sub.mealPlanId} not found in DMBMealPlan for sub ${sub.subscriptionId}`);
            }
        }
    }
    
    console.log(`Successfully verified and fixed ${fixed} subscriptions`);
    await mongoose.disconnect();
}).catch(console.error);
