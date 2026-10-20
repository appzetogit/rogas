import { ValidationError } from '../../../../core/auth/errors.js';
import { AdminCity } from '../models/adminCity.model.js';
import { FoodZone } from '../models/zone.model.js';
import { polygonInside, polygonsOverlap, validPolygon } from '../../../dailymealbox/zones/polygonGeo.js';

/**
 * The zone hierarchy: a MAIN ZONE (the city) has a boundary drawn on the map; its SUB-ZONES (food zones) are drawn inside it,
 * never overlapping each other. These checks run on every save, so the stored shapes always obey the rules.
 */

export const normalizePolygon = (coordinates, label = 'The shape') => {
    if (!validPolygon(coordinates)) throw new ValidationError(`${label} needs at least 3 valid map points`);
    return coordinates.map((c) => ({ latitude: Number(c.latitude), longitude: Number(c.longitude) }));
};

/** Throws unless `coordinates` fits inside the city's boundary and overlaps no other sub-zone of the city. */
export const assertSubZoneFits = async ({ city, coordinates, excludeZoneId = null }) => {
    if (!validPolygon(city.boundary)) throw new ValidationError('Draw the main zone boundary first, then add sub-zones inside it');
    if (!polygonInside(coordinates, city.boundary)) throw new ValidationError('The sub-zone must be drawn completely inside the main zone boundary');
    const siblings = await FoodZone.find({ _id: { $in: (city.zoneIds || []).filter((id) => String(id) !== String(excludeZoneId)) } }).select('name coordinates').lean();
    const clash = siblings.find((z) => validPolygon(z.coordinates) && polygonsOverlap(coordinates, z.coordinates));
    if (clash) throw new ValidationError(`The sub-zone overlaps "${clash.name}". Sub-zones of one main zone cannot overlap`);
};

/** Throws when a new boundary would leave an existing sub-zone partly outside it. */
export const assertBoundaryHoldsZones = async ({ boundary, zoneIds }) => {
    const zones = await FoodZone.find({ _id: { $in: zoneIds || [] } }).select('name coordinates').lean();
    const outside = zones.filter((z) => validPolygon(z.coordinates) && !polygonInside(z.coordinates, boundary));
    if (outside.length) throw new ValidationError(`These sub-zones would fall outside the main zone: ${outside.map((z) => z.name).join(', ')}. Redraw them first`);
};

/** A zone belongs to one main zone only. Returns the other city that already holds one of `zoneIds`, if any. */
export const cityHoldingAny = async (zoneIds, exceptCityId = null) =>
    AdminCity.findOne({ _id: { $ne: exceptCityId }, zoneIds: { $in: zoneIds } }).select('name zoneIds').lean();

/** The city a zone belongs to (or null). */
export const cityOfZone = (zoneId) => AdminCity.findOne({ zoneIds: zoneId });
