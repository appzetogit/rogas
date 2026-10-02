import mongoose from 'mongoose';
import { FoodUser } from '../../../../core/users/user.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { validatePoint } from '../../../dailymealbox/zones/zoneGeo.service.js';

/**
 * Customer address book.
 * Amendment v2 Extra:
 *   Gap U — every saved address must fall inside an active delivery zone (checked on save; the zone is stored).
 *   Gap V — up to 5 addresses: one Home, one Office and up to 3 named "Other" addresses.
 *           Editing an address that a live subscription delivers to updates that subscription too — unless the new
 *           location is outside the zone its maker serves, in which case nothing is saved and the customer is asked to
 *           choose a new maker first.
 */

const MAX_ADDRESSES = 5;
const MAX_OTHER = 3;

/** Error the apps can show with its `code` (ADDRESS_OUTSIDE_ZONE, ADDRESS_LIMIT, SUBSCRIPTION_ZONE_MISMATCH). */
class AddressError extends ValidationError {
    constructor(message, code, details = {}) {
        super(message);
        this.code = code;
        this.details = details;
        this.statusCode = code === 'SUBSCRIPTION_ZONE_MISMATCH' ? 409 : 422;
    }
}

const toGeoPoint = ({ latitude, longitude }) => {
    if (latitude === undefined || longitude === undefined) return undefined;
    const lat = Number(latitude);
    const lng = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
    return { type: 'Point', coordinates: [lng, lat] };
};

const normalizeLabel = (label) => {
    const v = String(label || '').trim();
    if (v === 'Work') return 'Office';
    if (v === 'home' || v === 'Home') return 'Home';
    if (v === 'office' || v === 'Office') return 'Office';
    if (v === 'other' || v === 'Other') return 'Other';
    return 'Other';
};

/** Zone check (Gap U). Returns the zone id or throws an AddressError. */
const zoneFor = async (location, { userId, source, city }) => {
    if (!location?.coordinates) {
        throw new AddressError('Pick the address on the map so we can check it is inside our delivery area', 'ADDRESS_NO_COORDINATES');
    }
    const [lng, lat] = location.coordinates;
    const res = await validatePoint({ lat, lng, source, userId, city });
    if (!res.inZone) {
        throw new AddressError('This address is outside our delivery area', 'ADDRESS_OUTSIDE_ZONE', { nearest: res.nearest });
    }
    return res.zoneId;
};

/** Live subscriptions delivering to this saved address (whole subscription or some weekdays). */
const subscriptionsUsing = async (userId, addressId) => {
    const { DMBSubscription } = await import('../../../dailymealbox/subscription/subscription.model.js');
    return DMBSubscription.find({
        userId,
        status: { $in: ['active', 'paused', 'pending_payment'] },
        $or: [{ 'deliveryAddress.addressId': addressId }, { 'dayAddresses.addressId': addressId }]
    });
};

const snapshotOf = (address) => ({
    label: address.label, customLabel: address.customLabel || '', street: address.street, additionalDetails: address.additionalDetails || '',
    city: address.city, state: address.state, zipCode: address.zipCode || '', phone: address.phone || '',
    location: address.location, addressId: address._id, zoneId: address.zoneId || null
});

/**
 * Refuses an address edit that would move a subscription outside its maker's delivery zone (Gap U), and otherwise
 * copies the new address into those subscriptions and their not-yet-prepared deliveries.
 */
const propagateToSubscriptions = async (userId, address, { apply }) => {
    const subs = await subscriptionsUsing(userId, address._id);
    if (!subs.length) return [];
    const { FoodRestaurant } = await import('../../restaurant/models/restaurant.model.js');
    const { vendorServesZone } = await import('../../../dailymealbox/subscription/pricing.service.js');
    const conflicts = [];
    for (const sub of subs) {
        const vendorIds = [sub.vendorId, ...((sub.rotation || []).map((r) => r.vendorId))];
        const vendors = await FoodRestaurant.find({ _id: { $in: vendorIds } }).select('restaurantName zoneId deliveryZoneIds').lean();
        const bad = vendors.filter((v) => !vendorServesZone(v, address.zoneId));
        if (bad.length) conflicts.push({ sub, vendors: bad });
    }
    if (conflicts.length) {
        for (const { sub } of conflicts) {
            sub.zoneMismatch = { detected: true, at: new Date(), newZoneId: address.zoneId };
            await sub.save();
        }
        throw new AddressError(
            `${conflicts[0].vendors[0].restaurantName} doesn't deliver to this address. Choose a new maker for your subscription first, then change the address.`,
            'SUBSCRIPTION_ZONE_MISMATCH',
            { subscriptions: conflicts.map(({ sub, vendors }) => ({ subscriptionId: sub.subscriptionId, _id: sub._id, vendors: vendors.map((v) => ({ _id: v._id, name: v.restaurantName })) })) }
        );
    }
    if (!apply) return subs;

    const { DMBDailyOrder } = await import('../../../dailymealbox/subscription/dmb.dailyOrder.model.js');
    const { localToday } = await import('../../../../utils/platformTime.js');
    const snap = snapshotOf(address);
    for (const sub of subs) {
        const touchedDays = [];
        if (String(sub.deliveryAddress?.addressId) === String(address._id)) {
            sub.deliveryAddress = snap;
            sub.zoneId = address.zoneId;
        }
        for (const d of sub.dayAddresses || []) {
            if (String(d.addressId) === String(address._id)) {
                d.address = snap;
                touchedDays.push(d.day);
            }
        }
        sub.zoneMismatch = { detected: false, at: null, newZoneId: null };
        sub.markModified('dayAddresses');
        await sub.save();
        // Future deliveries not yet in preparation follow the new address (one-off overrides are left alone).
        const future = await DMBDailyOrder.find({ subscriptionId: sub._id, deliveryDate: { $gte: localToday() }, status: 'scheduled', addressOverridden: { $ne: true } });
        for (const order of future) {
            const dow = new Date(order.deliveryDate).getUTCDay();
            const dayOwn = (sub.dayAddresses || []).find((d) => Number(d.day) === dow);
            if (dayOwn ? String(dayOwn.addressId) === String(address._id) : String(sub.deliveryAddress?.addressId) === String(address._id)) {
                order.deliveryAddress = snap;
                await order.save();
            }
        }
    }
    return subs;
};

export const listAddresses = async (userId) => {
    const user = await FoodUser.findById(userId).select('addresses').lean();
    return { addresses: user?.addresses || [], limits: { max: MAX_ADDRESSES, maxOther: MAX_OTHER } };
};

export const addAddress = async (userId, dto) => {
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = {
        label: normalizeLabel(dto.label),
        customLabel: String(dto.customLabel || '').trim().slice(0, 30),
        street: dto.street,
        additionalDetails: dto.additionalDetails || '',
        city: dto.city,
        state: dto.state,
        zipCode: dto.zipCode || '',
        phone: dto.phone || '',
        location: toGeoPoint(dto),
        isDefault: false
    };
    address.zoneId = await zoneFor(address.location, { userId, source: 'address_add', city: address.city });

    // Home and Office are single entries (saving again updates them); "Other" addresses are kept apart by name.
    const existingIdx = user.addresses.findIndex((a) => {
        if (String(a?.label) !== address.label) return false;
        if (address.label !== 'Other') return true;
        return String(a.customLabel || '').toLowerCase() === address.customLabel.toLowerCase();
    });
    if (existingIdx >= 0) {
        const existing = user.addresses[existingIdx];
        Object.assign(existing, {
            street: address.street, additionalDetails: address.additionalDetails, city: address.city, state: address.state,
            zipCode: address.zipCode, phone: address.phone, customLabel: address.customLabel, zoneId: address.zoneId
        });
        if (address.location) existing.location = address.location;
        await propagateToSubscriptions(userId, existing, { apply: false });
        await user.save();
        await propagateToSubscriptions(userId, existing, { apply: true });
        return { address: existing.toObject() };
    }

    if (user.addresses.length >= MAX_ADDRESSES) {
        throw new AddressError(`You can save up to ${MAX_ADDRESSES} addresses. Remove one first.`, 'ADDRESS_LIMIT');
    }
    if (address.label === 'Other' && user.addresses.filter((a) => a.label === 'Other').length >= MAX_OTHER) {
        throw new AddressError(`You can save up to ${MAX_OTHER} custom addresses besides Home and Office.`, 'ADDRESS_LIMIT');
    }

    if (!user.addresses.some((a) => a.isDefault)) address.isDefault = true;
    user.addresses.push(address);
    await user.save();
    const saved = user.addresses[user.addresses.length - 1];
    return { address: saved.toObject() };
};

export const updateAddress = async (userId, addressId, dto) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    if (dto.label !== undefined) address.label = normalizeLabel(dto.label);
    if (dto.customLabel !== undefined) address.customLabel = String(dto.customLabel || '').trim().slice(0, 30);
    if (dto.street !== undefined) address.street = dto.street;
    if (dto.additionalDetails !== undefined) address.additionalDetails = dto.additionalDetails || '';
    if (dto.city !== undefined) address.city = dto.city;
    if (dto.state !== undefined) address.state = dto.state;
    if (dto.zipCode !== undefined) address.zipCode = dto.zipCode || '';
    if (dto.phone !== undefined) address.phone = dto.phone || '';
    const location = toGeoPoint(dto);
    if (location) address.location = location;
    if (location || !address.zoneId) {
        address.zoneId = await zoneFor(address.location, { userId, source: 'address_update', city: address.city });
    }

    // Refuse before saving if a subscription's maker does not serve the new zone.
    await propagateToSubscriptions(userId, address, { apply: false });
    await user.save();
    await propagateToSubscriptions(userId, address, { apply: true });
    return { address: address.toObject() };
};

export const deleteAddress = async (userId, addressId) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    const inUse = await subscriptionsUsing(userId, address._id);
    if (inUse.length) {
        throw new AddressError('This address is used by an active subscription. Change the subscription\'s address first.', 'ADDRESS_IN_USE', { subscriptions: inUse.map((s) => s.subscriptionId) });
    }

    const wasDefault = !!address.isDefault;
    address.deleteOne();

    // If deleting default, promote the newest remaining address to default
    if (wasDefault) {
        const remaining = user.addresses.filter(Boolean);
        if (remaining.length) {
            remaining.forEach((a) => {
                a.isDefault = false;
            });
            remaining[remaining.length - 1].isDefault = true;
        }
    }

    await user.save();
    return { success: true };
};

export const setDefaultAddress = async (userId, addressId) => {
    if (!mongoose.Types.ObjectId.isValid(addressId)) {
        throw new ValidationError('Invalid address id');
    }
    const user = await FoodUser.findById(userId).select('addresses');
    if (!user) throw new ValidationError('User not found');

    const address = user.addresses.id(addressId);
    if (!address) throw new ValidationError('Address not found');

    user.addresses.forEach((a) => {
        a.isDefault = String(a._id) === String(addressId);
    });
    await user.save();

    const updated = user.addresses.id(addressId);
    return { address: updated?.toObject() };
};
