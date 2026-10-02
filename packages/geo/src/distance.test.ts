import { expect, test } from 'vitest';
import { distance, EARTH_RADIUS } from './distance';

test('a degree along the equator is 2πR/360', () => expect(distance({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo((2 * Math.PI * EARTH_RADIUS) / 360, 6));
test('antipodes are πR apart', () => expect(distance({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(Math.PI * EARTH_RADIUS, 4));
test('pole to pole is πR', () => expect(distance({ lat: 90, lng: 0 }, { lat: -90, lng: 45 })).toBeCloseTo(Math.PI * EARTH_RADIUS, 4));
test('a point is 0 from itself', () => expect(distance({ lat: 40.7128, lng: -74.006 }, { lat: 40.7128, lng: -74.006 })).toBe(0));
test('across the antimeridian is the short way', () => expect(distance({ lat: 0, lng: 179.5 }, { lat: 0, lng: -179.5 })).toBeCloseTo((2 * Math.PI * EARTH_RADIUS) / 360, 6));
