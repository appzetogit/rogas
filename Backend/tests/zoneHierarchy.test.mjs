/**
 * Main zone (city) boundary and sub-zones drawn inside it: inside / overlap / touching rules, and the save-time checks.
 * Needs a LOCAL MongoDB:   AMENDMENT_TEST_MONGO_URI=mongodb://127.0.0.1:27099 node --test tests/zoneHierarchy.test.mjs
 */
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';

const { connect, disconnect } = await import('./helpers/amendmentFixtures.mjs');
const geo = await import('../src/modules/dailymealbox/zones/polygonGeo.js');

const box = (lat0, lng0, lat1, lng1) => [
    { latitude: lat0, longitude: lng0 }, { latitude: lat0, longitude: lng1 }, { latitude: lat1, longitude: lng1 }, { latitude: lat1, longitude: lng0 }
];

test('polygon rules: inside, partly outside, overlapping, touching along an edge, identical, far apart', () => {
    const city = box(0, 0, 10, 10);
    assert.equal(geo.polygonInside(box(1, 1, 4, 4), city), true);
    assert.equal(geo.polygonInside(box(0, 0, 5, 5), city), true, 'running along the edge is still inside');
    assert.equal(geo.polygonInside(box(8, 8, 12, 12), city), false, 'sticking out');
    assert.equal(geo.polygonInside(box(-5, -5, -1, -1), city), false, 'entirely outside');
    // a concave main zone: a sub-zone whose corners are inside but whose edge cuts across the notch
    const lShape = [{ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 10 }, { latitude: 4, longitude: 10 }, { latitude: 4, longitude: 4 }, { latitude: 10, longitude: 4 }, { latitude: 10, longitude: 0 }];
    assert.equal(geo.polygonInside(box(1, 1, 9, 3), lShape), true);
    assert.equal(geo.polygonInside(box(1, 1, 9, 9), lShape), false, 'corners inside the L but the shape leaves it');

    assert.equal(geo.polygonsOverlap(box(0, 0, 5, 5), box(3, 3, 8, 8)), true);
    assert.equal(geo.polygonsOverlap(box(0, 0, 5, 5), box(1, 1, 2, 2)), true, 'one inside the other');
    assert.equal(geo.polygonsOverlap(box(0, 0, 5, 5), box(0, 0, 5, 5)), true, 'identical');
    assert.equal(geo.polygonsOverlap(box(0, 0, 5, 5), box(0, 5, 5, 10)), false, 'side by side, sharing an edge');
    assert.equal(geo.polygonsOverlap(box(0, 0, 5, 5), box(6, 6, 9, 9)), false, 'far apart');
    assert.equal(geo.polygonsOverlap(box(0, 0, 7, 10), box(5, 0, 10, 10)), true, 'same width, one bar cuts into the other');
    assert.equal(geo.polygonsOverlap(box(0, 0, 5, 10), box(5, 0, 10, 10)), false, 'same width, stacked');
});

let svc, AdminCity, FoodZone, admin;
before(async () => {
    await connect('zone_hierarchy_test');
    svc = await import('../src/modules/food/admin/services/prdAdmin.service.js');
    admin = await import('../src/modules/food/admin/services/admin.service.js');
    ({ AdminCity } = await import('../src/modules/food/admin/models/adminCity.model.js'));
    ({ FoodZone } = await import('../src/modules/food/admin/models/zone.model.js'));
});
after(disconnect);

const refused = (promise, text) => assert.rejects(promise, (e) => new RegExp(text, 'i').test(e.message));

test('the admin draws the main zone, then sub-zones inside it; every other shape is refused', async () => {
    const name = `Hierarchy ${Date.now()}`;
    const city = await svc.createCity({ name, country: 'Poland', currency: 'PLN', boundary: box(50, 20, 51, 21) }, {});
    assert.equal(city.boundary.length, 4);

    const north = await svc.createSubZone(city._id, { name: 'North', coordinates: box(50.5, 20, 51, 21) }, {});
    assert.ok(north._id);
    const south = await svc.createSubZone(city._id, { name: 'South', coordinates: box(50, 20, 50.5, 21) }, {});
    assert.ok(south._id, 'sub-zones that only share an edge are fine');

    await refused(svc.createSubZone(city._id, { name: 'Outside', coordinates: box(52, 22, 53, 23) }, {}), 'inside the main zone');
    await refused(svc.createSubZone(city._id, { name: 'Sticks out', coordinates: box(50.8, 20.5, 51.5, 21.5) }, {}), 'inside the main zone');
    await refused(svc.createSubZone(city._id, { name: 'Overlap', coordinates: box(50.4, 20.2, 50.6, 20.8) }, {}), 'overlaps');
    await refused(svc.createSubZone(city._id, { name: 'Line', coordinates: [{ latitude: 50.1, longitude: 20.1 }, { latitude: 50.2, longitude: 20.2 }] }, {}), 'at least 3');
    await refused(svc.createSubZone(city._id, { name: '', coordinates: box(50.1, 20.1, 50.2, 20.2) }, {}), 'name');

    const map = await svc.getCityMap(city._id);
    assert.equal(map.subZones.length, 2);
    assert.equal(map.city.boundary.length, 4);

    // redrawing: a bigger South that would cut into North is refused; a smaller one is fine
    await refused(svc.updateSubZone(city._id, south._id, { coordinates: box(50, 20, 50.7, 21) }, {}), 'overlaps');
    assert.ok(await svc.updateSubZone(city._id, south._id, { coordinates: box(50, 20, 50.4, 21) }, {}));

    // the main boundary cannot be shrunk past an existing sub-zone
    await refused(svc.updateCity(city._id, { boundary: box(50, 20, 50.6, 21) }, {}), 'fall outside');
    assert.ok(await svc.updateCity(city._id, { boundary: box(49.5, 19.5, 51.5, 21.5) }, {}));

    // the generic zone editor obeys the same rules
    await refused(admin.updateZone(north._id, { coordinates: box(50.5, 20, 53, 21) }), 'inside the main zone');

    // deleting a sub-zone takes it out of its main zone
    await admin.deleteZone(south._id);
    const after2 = await AdminCity.findById(city._id).lean();
    assert.deepEqual(after2.zoneIds.map(String), [String(north._id)]);
});

test('a zone belongs to one main zone only; a main zone without a boundary cannot take sub-zones', async () => {
    const stamp = Date.now();
    const a = await svc.createCity({ name: `A ${stamp}`, country: 'Poland', currency: 'PLN', boundary: box(40, 10, 41, 11) }, {});
    const zone = await svc.createSubZone(a._id, { name: 'Z1', coordinates: box(40.1, 10.1, 40.4, 10.4) }, {});
    const b = await svc.createCity({ name: `B ${stamp}`, country: 'Poland', currency: 'PLN', boundary: box(40, 10, 41, 11) }, {});
    await refused(svc.updateCity(b._id, { zoneIds: [String(zone._id)] }, {}), 'one main zone only');

    const bare = await svc.createCity({ name: `Bare ${stamp}`, country: 'Poland', currency: 'PLN' }, {});
    await refused(svc.createSubZone(bare._id, { name: 'Z2', coordinates: box(30, 5, 31, 6) }, {}), 'main zone boundary first');
    assert.equal(await FoodZone.countDocuments({ name: 'Z2' }), 0);
});
