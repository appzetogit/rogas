import mongoose from 'mongoose';
import { FoodRestaurant } from '../../food/restaurant/models/restaurant.model.js';
import { getControl, isEnabled, cityIdForZone } from '../platform/platformConfig.service.js';
import { servedZoneIds } from '../subscription/pricing.service.js';
import { ecoBadgeVisible, activeSpecialisms, SPECIALISMS } from '../vendor/vendorAmendment.service.js';
import { localToday } from '../../../utils/platformTime.js';

/**
 * CA-09 Plans browse (Gap X): only makers that deliver to the customer's zone are ever returned — the filter is on the
 * server, not the app. Badges and filters from the addenda:
 *   AI  🌿 eco packaging (verified, or self-declared while ACM-176 is off) + ranking boost for eco-preferring customers
 *   AJ  Sat ✓ / Sun ✓ / 7 days; filters saturday / sunday
 *   AH  "Dietitian Certified" + specialism filter
 *   AL  🔥 Hot / ❄ Cold labels per ACM-182 + temperature filter
 *   AK  rotation=true → makers that can be part of a Smart Rotation (ACM-178/180)
 *   M   pre-order meals
 */

const oid = (v) => (v && mongoose.Types.ObjectId.isValid(String(v)) ? String(v) : null);
const truthy = (v) => v === true || v === 'true' || v === '1';

const temperatureVisible = (display, t) => display === 'both' || (display === 'hot_only' && t === 'hot') || (display === 'cold_only' && t === 'cold');

export const browseVendors = async ({ zoneId, filters = {}, userId = null }) => {
    const zone = oid(zoneId);
    if (!zone) {
        const err = new Error('Choose your delivery zone first');
        err.statusCode = 400;
        err.code = 'ZONE_REQUIRED';
        throw err;
    }
    const cityId = await cityIdForZone(zone);
    const ctx = { cityId };
    const [tempCfg, rotationOn, rotationTypes, weekend] = await Promise.all([
        getControl('temperatureLabels', ctx), isEnabled('smartRotation', ctx), getControl('rotationVendorTypes', ctx), getControl('weekendDelivery', ctx)
    ]);
    const display = tempCfg.display || 'both';

    let vendors = (await FoodRestaurant.find({ status: 'approved', vendorType: { $ne: 'pantry_shop' } })
        .select('restaurantName ownerName profileImage coverImages cuisines city vendorType zoneId deliveryZoneIds deliveryWeekdays ecoPackaging specialisms mealRating rating totalRatings vacationMode isAcceptingOrders rotationAvailable cookTrack track1Paused')
        .lean())
        .filter((v) => servedZoneIds(v).includes(zone));
    const { blockedCookIds } = await import('../legal/legal.service.js');
    const blocked = await blockedCookIds(vendors);
    if (blocked.size) vendors = vendors.filter((v) => !blocked.has(String(v._id)));

    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const meals = await DMBMealPlan.find({ vendorId: { $in: vendors.map((v) => v._id) }, status: { $in: ['active', 'pre_order'] } })
        .select('vendorId temperatureType planCategory status launchDate pricePerDay dietTags').lean();
    const byVendor = new Map();
    for (const m of meals) {
        const k = String(m.vendorId);
        if (!byVendor.has(k)) byVendor.set(k, []);
        byVendor.get(k).push(m);
    }

    let ecoPref = false;
    if (userId) {
        const { FoodUser } = await import('../../../core/users/user.model.js');
        ecoPref = Boolean((await FoodUser.findById(userId).select('ecoPreference').lean())?.ecoPreference);
    }
    const search = String(filters.search || '').trim().toLowerCase();
    const out = [];
    for (const v of vendors) {
        const vm = byVendor.get(String(v._id)) || [];
        const activeMeals = vm.filter((m) => m.status === 'active');
        if (!activeMeals.length && !vm.some((m) => m.status === 'pre_order')) continue;
        const days = Array.isArray(v.deliveryWeekdays) && v.deliveryWeekdays.length ? v.deliveryWeekdays : [1, 2, 3, 4, 5];
        const sat = days.includes(6) && weekend.saturday;
        const sun = days.includes(0) && weekend.sunday;
        const eco = await ecoBadgeVisible(v);
        const specialisms = activeSpecialisms(v);
        const temps = [...new Set(activeMeals.map((m) => m.temperatureType).filter((t) => t && temperatureVisible(display, t)))];
        const rotationCapable = rotationOn && v.rotationAvailable !== false && (rotationTypes.allowed || []).includes(v.vendorType) && activeMeals.length > 0;

        if (truthy(filters.eco) && !eco) continue;
        if (truthy(filters.saturday) && !sat) continue;
        if (truthy(filters.sunday) && !sun) continue;
        if (filters.specialism && !specialisms.some((s) => s.specialism === filters.specialism)) continue;
        if (filters.temperature && (!temperatureVisible(display, filters.temperature) || !activeMeals.some((m) => m.temperatureType === filters.temperature))) continue;
        if (truthy(filters.rotation) && !rotationCapable) continue;
        if (filters.diet && !activeMeals.some((m) => (m.dietTags || []).includes(String(filters.diet).toLowerCase()) || m.planCategory === filters.diet)) continue;
        if (search && !`${v.restaurantName} ${v.ownerName} ${(v.cuisines || []).join(' ')}`.toLowerCase().includes(search)) continue;

        const rating = v.mealRating?.count ? v.mealRating.average : (v.rating || 0);
        out.push({
            _id: v._id,
            name: v.restaurantName,
            chefName: v.ownerName,
            vendorType: v.vendorType,
            image: v.coverImages?.[0] || v.profileImage || '',
            profileImage: v.profileImage || '',
            cuisines: v.cuisines || [],
            city: v.city,
            rating: rating ? Math.round(rating * 10) / 10 : null,
            ratingCount: v.mealRating?.count || v.totalRatings || 0,
            fromPrice: activeMeals.length ? Math.min(...activeMeals.map((m) => m.pricePerDay)) : null,
            badges: {
                eco: eco ? { type: v.ecoPackaging.type } : null,
                weekend: sat && sun ? '7_days' : sat ? 'sat' : sun ? 'sun' : null,
                dietitianCertified: specialisms.length ? specialisms : null,
                temperatures: temps,
                preOrder: vm.some((m) => m.status === 'pre_order' && m.launchDate && new Date(m.launchDate) > localToday())
            },
            deliveryWeekdays: days,
            rotationCapable,
            onVacation: Boolean(v.vacationMode),
            // AI: eco packaging lifts the vendor for customers who prefer it (+0.2), it never hides anyone.
            score: rating + (ecoPref && eco ? 0.2 : 0)
        });
    }
    out.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
    return {
        zoneId: zone,
        filtersAvailable: {
            eco: true,
            saturday: Boolean(weekend.saturday),
            sunday: Boolean(weekend.sunday),
            specialisms: (await isEnabled('medicalSpecialisms', ctx)) ? SPECIALISMS : [],
            temperatures: display === 'hidden' ? [] : display === 'both' ? ['hot', 'cold'] : [display === 'hot_only' ? 'hot' : 'cold'],
            rotation: rotationOn
        },
        vendors: out
    };
};

/** One maker's meals with Gap AL / M / E badges (customer view). */
export const vendorMeals = async ({ vendorId, zoneId }) => {
    const vendor = await FoodRestaurant.findById(vendorId).select('restaurantName zoneId deliveryZoneIds status ecoPackaging specialisms cookTrack track1Paused').lean();
    const { blockedCookIds } = await import('../legal/legal.service.js');
    if (!vendor || vendor.status !== 'approved' || (await blockedCookIds([vendor])).size) {
        const err = new Error('Maker not found');
        err.statusCode = 404;
        throw err;
    }
    if (zoneId && !servedZoneIds(vendor).includes(String(zoneId))) {
        const err = new Error(`${vendor.restaurantName} does not deliver to your zone`);
        err.statusCode = 409;
        err.code = 'ZONE_MISMATCH';
        throw err;
    }
    const display = (await getControl('temperatureLabels', { zoneId })).display || 'both';
    const { DMBMealPlan } = await import('../mealplan/mealPlan.model.js');
    const { canSell } = await import('../orders/stock.service.js');
    const meals = await DMBMealPlan.find({ vendorId, status: { $in: ['active', 'pre_order'] } }).lean();
    const today = localToday();
    const out = [];
    for (const m of meals) {
        const stock = m.status === 'active' ? await canSell(m, today, 1) : null;
        out.push({
            _id: m._id, name: m.name, description: m.description, photos: m.photos, pricePerDay: m.pricePerDay, nutrition: m.nutrition,
            allergens: m.allergens, dietTags: m.dietTags, planCategory: m.planCategory, availableSlots: m.availableSlots, rating: m.rating,
            status: m.status, launchDate: m.launchDate, preorderCutoff: m.preorderCutoff,
            temperatureType: m.temperatureType && temperatureVisible(display, m.temperatureType) ? m.temperatureType : null,
            reheatInstructions: m.temperatureType === 'cold' && temperatureVisible(display, 'cold') ? m.reheatInstructions : '',
            soldOutToday: stock ? stock.soldOut : false
        });
    }
    return {
        vendor: { _id: vendor._id, name: vendor.restaurantName, eco: (await ecoBadgeVisible(vendor)) ? vendor.ecoPackaging : null, specialisms: activeSpecialisms(vendor) },
        temperatureDisplay: display,
        meals: out
    };
};
