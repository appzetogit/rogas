/**
 * Shared fixtures for the Amendment v2 Extra tests: a Warsaw zone + city, an approved vendor with meals, subscription
 * plans for every billing cycle, a fee setting and a customer. Needs a LOCAL MongoDB (see each test file's header).
 */
import mongoose from 'mongoose';

export const BASE_URI = process.env.AMENDMENT_TEST_MONGO_URI || 'mongodb://127.0.0.1:27017';
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(BASE_URI)) {
    throw new Error('Refusing to run: AMENDMENT_TEST_MONGO_URI must be a plain local mongod');
}

// Square around central Warsaw.
export const WARSAW = { lat: 52.2297, lng: 21.0122 };
export const OUTSIDE = { lat: 50.0647, lng: 19.945 }; // Kraków
const square = (c, d) => [
    { latitude: c.lat - d, longitude: c.lng - d },
    { latitude: c.lat - d, longitude: c.lng + d },
    { latitude: c.lat + d, longitude: c.lng + d },
    { latitude: c.lat + d, longitude: c.lng - d }
];

export const connect = async (name) => {
    process.env.PLATFORM_TIMEZONE = 'Europe/Warsaw';
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-secret';
    await mongoose.connect(BASE_URI, { dbName: `${name}_${Date.now()}` });
};

export const disconnect = async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
};

export const models = async () => ({
    FoodZone: (await import('../../src/modules/food/admin/models/zone.model.js')).FoodZone,
    AdminCity: (await import('../../src/modules/food/admin/models/adminCity.model.js')).AdminCity,
    FoodRestaurant: (await import('../../src/modules/food/restaurant/models/restaurant.model.js')).FoodRestaurant,
    DMBMealPlan: (await import('../../src/modules/dailymealbox/mealplan/mealPlan.model.js')).DMBMealPlan,
    VendorSubscriptionPlan: (await import('../../src/modules/dailymealbox/subscription/vendorSubscriptionPlan.model.js')).VendorSubscriptionPlan,
    DMBSubscription: (await import('../../src/modules/dailymealbox/subscription/subscription.model.js')).DMBSubscription,
    DMBDailyOrder: (await import('../../src/modules/dailymealbox/subscription/dmb.dailyOrder.model.js')).DMBDailyOrder,
    FoodUser: (await import('../../src/core/users/user.model.js')).FoodUser,
    DeliveryOrderFeeSettings: (await import('../../src/modules/food/admin/models/deliveryOrderFeeSettings.model.js')).DeliveryOrderFeeSettings,
    DeliverySlot: (await import('../../src/modules/dailymealbox/deliverySlot/deliverySlot.model.js')).DeliverySlot,
    DMBPlatformControl: (await import('../../src/modules/dailymealbox/platform/platform.models.js')).DMBPlatformControl,
    FoodAdmin: (await import('../../src/core/admin/admin.model.js')).FoodAdmin,
    FoodDeliveryPartner: (await import('../../src/modules/food/delivery/models/deliveryPartner.model.js')).FoodDeliveryPartner
});

let phoneSeq = 600000000;
export const nextPhone = () => `+48${phoneSeq++}`;

export const seedWorld = async () => {
    const m = await models();
    const zone = await m.FoodZone.create({ name: 'Warsaw Centre', country: 'Poland', coordinates: square(WARSAW, 0.08) });
    const zone2 = await m.FoodZone.create({ name: 'Warsaw South', country: 'Poland', coordinates: square({ lat: WARSAW.lat - 0.2, lng: WARSAW.lng }, 0.05) });
    const city = await m.AdminCity.create({ name: 'Warsaw', country: 'PL', currency: 'PLN', status: 'active', zoneIds: [zone._id, zone2._id] });
    await m.DeliveryOrderFeeSettings.create({ feePerOrder: 5, isActive: true });
    const vendor = await m.FoodRestaurant.create({
        restaurantName: 'Maria Kitchen', ownerName: 'Maria', ownerPhone: nextPhone(), ownerEmail: 'maria@example.com', status: 'approved',
        zoneId: zone._id, vendorType: 'home_cook', deliveryWeekdays: [0, 1, 2, 3, 4, 5, 6],
        location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat], latitude: WARSAW.lat, longitude: WARSAW.lng }
    });
    const vendor2 = await m.FoodRestaurant.create({
        restaurantName: 'Bistro Centrum', ownerName: 'Jan', ownerPhone: nextPhone(), status: 'approved',
        zoneId: zone._id, vendorType: 'restaurant', deliveryWeekdays: [1, 2, 3, 4, 5],
        location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat], latitude: WARSAW.lat, longitude: WARSAW.lng }
    });
    const farVendor = await m.FoodRestaurant.create({
        restaurantName: 'South Diner', ownerName: 'Ola', ownerPhone: nextPhone(), status: 'approved', zoneId: zone2._id, vendorType: 'restaurant',
        location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat - 0.2], latitude: WARSAW.lat - 0.2, longitude: WARSAW.lng }
    });
    const meal = await m.DMBMealPlan.create({ vendorId: vendor._id, name: 'Rosół', pricePerDay: 20, city: 'Warsaw', status: 'active', availableSlots: ['lunch', 'dinner'] });
    const meal2 = await m.DMBMealPlan.create({ vendorId: vendor._id, name: 'Pierogi', pricePerDay: 30, city: 'Warsaw', status: 'active' });
    const bistroMeal = await m.DMBMealPlan.create({ vendorId: vendor2._id, name: 'Kotlet', pricePerDay: 25, city: 'Warsaw', status: 'active' });
    const farMeal = await m.DMBMealPlan.create({ vendorId: farVendor._id, name: 'Zupa', pricePerDay: 15, city: 'Warsaw', status: 'active' });
    const mk = (name, duration, deliveryDays, extra = {}) => m.VendorSubscriptionPlan.create({ name, duration, deliveryDays, foodVat: 8, deliveryVat: 23, platformFee: 0, status: 'active', ...extra });
    const plans = {
        dayMF: await mk('One day', 'day', 'mon_fri'),
        weekMF: await mk('Weekly', 'week', 'mon_fri'),
        weekFull: await mk('Weekly 7', 'week', 'full_week'),
        fortMF: await mk('Fortnightly', 'fortnight', 'mon_fri'),
        monthMF: await mk('Monthly', 'month', 'mon_fri'),
        yearMF: await mk('Annual', 'year', 'mon_fri')
    };
    const user = await m.FoodUser.create({ phone: nextPhone(), name: 'Anna Kowalska', email: 'anna@example.com', role: 'USER' });
    const admin = await m.FoodAdmin.create({ email: `sa${Date.now()}@example.com`, password: 'Secret123!', adminRole: 'SUPER_ADMIN', name: 'Super' });
    const address = { street: 'Marszałkowska 1', city: 'Warsaw', state: 'Mazowieckie', label: 'Home', location: { type: 'Point', coordinates: [WARSAW.lng, WARSAW.lat] } };
    return { ...m, zone, zone2, city, vendor, vendor2, farVendor, meal, meal2, bistroMeal, farMeal, plans, user, admin, address };
};

export const setControl = async (key, value, cityId = null) => {
    const { DMBPlatformControl } = await import('../../src/modules/dailymealbox/platform/platform.models.js');
    const { invalidatePlatformConfig } = await import('../../src/modules/dailymealbox/platform/platformConfig.service.js');
    await DMBPlatformControl.findOneAndUpdate({ key, cityId }, { $set: { value } }, { upsert: true });
    invalidatePlatformConfig();
};

export const clearControls = async () => {
    const { DMBPlatformControl } = await import('../../src/modules/dailymealbox/platform/platform.models.js');
    const { invalidatePlatformConfig } = await import('../../src/modules/dailymealbox/platform/platformConfig.service.js');
    await DMBPlatformControl.deleteMany({});
    invalidatePlatformConfig();
};

/** Next date (YYYY-MM-DD, local) with the given JS weekday, at least `minAhead` days ahead. */
export const nextWeekday = async (dow, minAhead = 1) => {
    const { localToday, addDays, storageDateStr } = await import('../../src/utils/platformTime.js');
    let d = addDays(localToday(), minAhead);
    while (d.getUTCDay() !== dow) d = addDays(d, 1);
    return storageDateStr(d);
};
