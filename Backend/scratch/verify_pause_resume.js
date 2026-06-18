import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { DMBSubscription } from '../src/modules/dailymealbox/subscription/subscription.model.js';
import { DMBDailyOrder } from '../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js';
import { FoodUser } from '../src/core/users/user.model.js';
import { FoodRestaurant } from '../src/modules/food/restaurant/models/restaurant.model.js';
import { pauseSubscription, resumeSubscription } from '../src/modules/dailymealbox/subscription/subscription.service.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/rogas';

async function setupTestData(userId, vendorId) {
    // Clean up old test subscriptions
    await DMBSubscription.deleteMany({ userId });
    await DMBDailyOrder.deleteMany({ userId });

    const today = new Date();
    today.setUTCHours(0,0,0,0);
    const startDate = new Date(today);
    startDate.setUTCDate(today.getUTCDate() + 1);

    const endDate = new Date(startDate);
    endDate.setUTCDate(startDate.getUTCDate() + 7);

    const sub = await DMBSubscription.create({
        userId,
        vendorId,
        duration: 'weekly',
        startDate,
        endDate,
        nextDeliveryDate: startDate,
        deliveryDays: 'full_week',
        deliverySlot: 'lunch',
        deliverySlots: ['lunch'],
        deliveryAddress: {
            street: '123 Test St',
            city: 'Test City',
            state: 'TS'
        },
        pricing: {
            basePricePerDay: 100,
            totalPrice: 500
        },
        status: 'active'
    });

    // Create 3 upcoming daily orders
    const dates = [
        new Date(startDate), // Tuesday
        new Date(startDate),
        new Date(startDate)
    ];
    dates[1].setUTCDate(dates[0].getUTCDate() + 1); // Wednesday
    dates[2].setUTCDate(dates[0].getUTCDate() + 2); // Thursday

    const orders = [];
    for (let i = 0; i < 3; i++) {
        orders.push(await DMBDailyOrder.create({
            subscriptionId: sub._id,
            userId,
            vendorId,
            meals: [{ name: 'Test Meal', quantity: 1 }],
            deliveryDate: dates[i],
            deliverySlot: 'lunch',
            status: 'scheduled',
            pricing: { totalPrice: 100 }
        }));
    }

    return { sub, orders };
}

async function run() {
    await mongoose.connect(mongoUri);
    console.log('Connected to DB:', mongoUri);

    // Get any user and vendor
    const user = await FoodUser.findOne();
    const vendor = await FoodRestaurant.findOne();
    if (!user || !vendor) {
        console.error('No users or vendors in database, please seed first.');
        await mongoose.disconnect();
        return;
    }

    console.log(`Setting up test data for User: ${user._id}, Vendor: ${vendor._id}`);
    const { sub, orders } = await setupTestData(user._id, vendor._id);

    console.log('\n--- INITIAL STATE ---');
    console.log('Subscription start:', sub.startDate.toISOString());
    console.log('Subscription end:', sub.endDate.toISOString());
    orders.forEach((o, i) => console.log(`Order ${i + 1} date:`, o.deliveryDate.toISOString()));

    // Test Pausing for 2 days
    console.log('\n--- SIMULATING PAUSE FOR 2 DAYS ---');
    const pauseRes = await pauseSubscription({
        subscriptionId: sub.subscriptionId,
        userId: user._id,
        pauseDays: 2,
        reason: 'Testing pause'
    });

    const pausedSub = await DMBSubscription.findOne({ _id: sub._id });
    console.log('Sub status after pause:', pausedSub.status);
    console.log('Sub pausedUntil:', pausedSub.pausedUntil.toISOString());
    console.log('Sub endDate extended to:', pausedSub.endDate.toISOString());

    const pausedOrders = await DMBDailyOrder.find({ subscriptionId: sub._id }).sort({ deliveryDate: 1 });
    pausedOrders.forEach((o, i) => console.log(`Order ${i + 1} date after pause:`, o.deliveryDate.toISOString()));

    // Test Resuming early (after 0 days actual pause)
    console.log('\n--- SIMULATING RESUME EARLY (immediately) ---');
    // Mock the pause starting in the past or now
    // If paused now and resumed now, actualDays = 0, refundDays = 2
    const resumeRes = await resumeSubscription(sub.subscriptionId);

    const resumedSub = await DMBSubscription.findOne({ _id: sub._id });
    console.log('Sub status after resume:', resumedSub.status);
    console.log('Sub endDate shortened back to:', resumedSub.endDate.toISOString());

    const resumedOrders = await DMBDailyOrder.find({ subscriptionId: sub._id }).sort({ deliveryDate: 1 });
    resumedOrders.forEach((o, i) => console.log(`Order ${i + 1} date after resume:`, o.deliveryDate.toISOString()));

    // Clean up test data
    await DMBSubscription.deleteMany({ userId: user._id });
    await DMBDailyOrder.deleteMany({ userId: user._id });
    console.log('\nTest data cleaned up.');

    await mongoose.disconnect();
}

run().catch(console.error);
