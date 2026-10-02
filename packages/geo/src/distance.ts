import { assertCoordinates, type Coordinates } from './value';

/** The mean radius of the Earth, in meters: the IUGG's R₁, (2a + b) / 3 for the WGS 84 ellipsoid. */
export const EARTH_RADIUS = 6_371_008.8;

const RADIANS = Math.PI / 180;

/**
 * The great-circle distance between two points, in meters, by the haversine formula on a sphere of the
 * Earth's mean radius (`EARTH_RADIUS`). The Earth is slightly flattened, so this is within about 0.5% of
 * the distance along the ellipsoid: right for "how far", not for surveying.
 */
export function distance(a: Coordinates, b: Coordinates): number {
  assertCoordinates(a, 'distance');
  assertCoordinates(b, 'distance');
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLng = (b.lng - a.lng) * RADIANS;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(h)));
}
