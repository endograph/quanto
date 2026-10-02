import type { CheckProblem } from 'quanto';

/** A point on the Earth in decimal degrees (WGS 84): `lat` from -90 (south) to 90, `lng` from -180 (west) to 180. */
export interface Coordinates {
  readonly lat: number;
  readonly lng: number;
}

/** The structural check: finite numbers, in range. */
export function checkCoordinates(value: unknown): CheckProblem[] {
  if (!value || typeof value !== 'object') return [{ message: 'Expected { lat, lng } in decimal degrees.' }];
  const { lat, lng } = value as Record<string, unknown>;
  const problems: CheckProblem[] = [];
  if (typeof lat !== 'number' || !(Math.abs(lat) <= 90)) problems.push({ message: 'Expected a latitude from -90 to 90.', path: ['lat'] });
  if (typeof lng !== 'number' || !(Math.abs(lng) <= 180)) problems.push({ message: 'Expected a longitude from -180 to 180.', path: ['lng'] });
  return problems;
}

/** Throws unless `value` is well-formed coordinates: operations are given values, not user text. */
export function assertCoordinates(value: Coordinates, operation: string): void {
  const problems = checkCoordinates(value);
  if (problems.length > 0) {
    throw new Error(`@quantojs/geo: ${operation} was given ${JSON.stringify(value)}. ${problems.map((p) => p.message).join(' ')}`);
  }
}
