/**
 * A driver's zones: authorised zones plus one explicit primary zone (never guessed).
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/driverZones.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { connect, disconnect, seedWorld, nextPhone } from './helpers/amendmentFixtures.mjs';

let w, update;
before(async () => {
    await connect('driver_zones_test');
    w = await seedWorld();
    ({ updateDeliveryPartnerAssignment: update } = await import('../src/modules/food/admin/services/assignment.service.js'));
});
after(disconnect);

const mk = () => w.FoodDeliveryPartner.create({ name: 'Z', phone: nextPhone(), status: 'approved' });
const payload = (over) => ({ zoneIds: [String(w.zone._id), String(w.zone2._id)], primaryZoneId: String(w.zone._id), allowedShifts: [], maxVendorCapacity: 0, selectedVendorIds: [], ...over });

test('saves authorised zones with the primary zone; other zones are additional', async () => {
    const d = await mk();
    await update(d._id, payload());
    const fresh = await w.FoodDeliveryPartner.findById(d._id).lean();
    assert.equal(String(fresh.primaryZoneId), String(w.zone._id));
    assert.equal(fresh.zoneIds.length, 2);
});

test('refuses a missing primary zone or one outside the authorised zones', async () => {
    const d = await mk();
    await assert.rejects(update(d._id, payload({ primaryZoneId: '' })), /primary zone/);
    await assert.rejects(update(d._id, payload({ zoneIds: [String(w.zone._id)], primaryZoneId: String(w.zone2._id) })), /primary zone/);
});
