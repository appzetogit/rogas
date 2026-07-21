import dotenv from 'dotenv';
import mongoose from 'mongoose';
dotenv.config();

const uri = process.env.MONGO_URI || process.env.MONGODB_URI;

mongoose.connect(uri).then(async () => {
    const subCol = mongoose.connection.collection('dmb_subscriptions');
    const planCol = mongoose.connection.collection('dmb_meal_plans');
    
    const brokenSubs = await subCol.find({ "pricing.totalPrice": 0, source: 'office' }).toArray();
    console.log(`Found ${brokenSubs.length} broken subscriptions`);
    
    let fixed = 0;
    for (const sub of brokenSubs) {
        if (sub.mealPlanId) {
            const plan = await planCol.findOne({ _id: sub.mealPlanId });
            if (plan) {
                const pricePerDay = plan.pricePerDay || 0;
                const totalMonthlyPrice = pricePerDay * 22; // 22 working days
                
                const updateObj = {
                    $set: {
                        "pricing.basePricePerDay": pricePerDay,
                        "pricing.totalPrice": totalMonthlyPrice,
                        "meals": [{ mealPlanId: sub.mealPlanId, quantity: 1 }]
                    }
                };
                
                // If deliverySlots is missing or empty, try to populate from deliverySlot
                if (!sub.deliverySlots || sub.deliverySlots.length === 0) {
                    if (sub.deliverySlot) {
                        updateObj.$set.deliverySlots = [sub.deliverySlot];
                    }
                }

                await subCol.updateOne({ _id: sub._id }, updateObj);
                fixed++;
            }
        }
    }
    
    console.log(`Successfully fixed ${fixed} subscriptions`);
    await mongoose.disconnect();
}).catch(console.error);
