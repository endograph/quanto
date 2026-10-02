import { defineCodec, formatNumber, normalize, type Codec, type CodecOptions, type ParseOutcome, type ResolvedCtx } from 'quanto';
import { hemisphere, type Axis } from '../formats';
import { GEOHASH_LIKE, GEOHASH_MIN_LENGTH, readGeohash } from '../geohash';
import { PLUS_CODE_LIKE, readPlusCode } from '../plus-code';
import { checkCoordinates, type Coordinates } from '../value';

export interface CoordinatesOptions extends CodecOptions<Coordinates> {
  /**
   * The order of a bare pair, one without hemisphere letters or labels: `latLng` (the default; what
   * people write and map apps copy) or `lngLat` (GeoJSON's order). A pair out of range in this order is
   * an issue, never swapped; the swapped reading is offered as an alternative when it's in range. Pairs
   * with letters or labels can come in either order. `format` follows it too.
   */
  readonly order?: 'latLng' | 'lngLat' | undefined;
  /**
   * Also read geohashes (`dr5regw3p`) of at least 5 characters, as the center of the cell. Off by default:
   * ordinary words can be geohashes (`denver`, `sushi`), so turn it on only for fields that expect them.
   */
  readonly geohash?: boolean | undefined;
}

/** One coordinate's number: a sign, and degrees with optional minutes and seconds. */
interface Angle {
  readonly sign: '' | '+' | '-';
  readonly degrees: number;
  readonly start: number;
  readonly end: number;
}

type Token =
  | { readonly kind: 'angle'; readonly angle: Angle }
  | { readonly kind: 'hemisphere'; readonly axis: Axis; readonly negative: boolean; readonly letter: string }
  | { readonly kind: 'label'; readonly axis: Axis; readonly text: string }
  | { readonly kind: 'separator' };

type Marker = Extract<Token, { kind: 'hemisphere' | 'label' }>;

const HEMISPHERES: Readonly<Record<string, { readonly axis: Axis; readonly negative: boolean }>> = {
  n: { axis: 'lat', negative: false },
  s: { axis: 'lat', negative: true },
  e: { axis: 'lng', negative: false },
  w: { axis: 'lng', negative: true },
};
const HEMISPHERE = /^(north|south|east|west|[nsew])(?!\p{L})/iu;
const LABEL = /^(latitude|longitude|lat|long|lng|lon)(?!\p{L})(?: ?[:=])?/iu;
const POINT_NUMBER = /^[+-]?\d+(?:\.\d+)?/;
const COMMA_NUMBER = /^[+-]?\d+(?:[.,]\d+)?/;
const BRACKETS = /^([([])(.*)([)\]])$/s;

const EXAMPLE = `Write coordinates like 40.7128, -74.0060 or 40°42'46" N 74°0'22" W.`;

const unparseable = (message: string, alternatives?: Coordinates[]): ParseOutcome<Coordinates> => ({
  ok: false,
  issues: [{ code: 'unparseable', message }],
  ...(alternatives ? { alternatives } : {}),
});

/** The number at `i`, if there is one. */
const numberAt = (text: string, i: number, pattern: RegExp): RegExpExecArray | null => pattern.exec(text.slice(i));
const skipSpaces = (text: string, i: number): number => (text[i] === ' ' ? i + 1 : i);
const toNumber = (digits: string): number => Number(digits.replace(',', '.'));

/**
 * Reads degrees at `i`, with an optional `°`, then minutes (`42'`) and seconds (`46"`) if they're marked.
 * Only the last part may have decimals, and minutes and seconds are under 60.
 */
function readAngle(text: string, start: number, pattern: RegExp): { angle: Angle } | { error: string } {
  const head = numberAt(text, start, pattern)!;
  const sign = /^[+-]/.test(head[0]) ? (head[0][0] as '+' | '-') : '';
  const parts = [head[0].replace(/^[+-]/, '')];
  let end = start + head[0].length;
  let i = skipSpaces(text, end);
  if (text[i] === '°') end = i + 1;
  for (const mark of ["'", '"']) {
    i = skipSpaces(text, end);
    const part = numberAt(text, i, pattern);
    if (!part || /^[+-]/.test(part[0])) break;
    const after = skipSpaces(text, i + part[0].length);
    if (text[after] !== mark) break;
    parts.push(part[0]);
    end = after + 1;
  }
  if (parts.slice(0, -1).some((part) => /[.,]/.test(part))) {
    return { error: `Only the last of degrees, minutes and seconds can have decimals: "${text.slice(start, end)}".` };
  }
  const [degrees, minutes = 0, seconds = 0] = parts.map(toNumber) as [number, number?, number?];
  if (minutes >= 60) return { error: `Minutes must be less than 60: "${text.slice(start, end)}".` };
  if (seconds >= 60) return { error: `Seconds must be less than 60: "${text.slice(start, end)}".` };
  return { angle: { sign, degrees: degrees + minutes / 60 + seconds / 3600, start, end } };
}

/** Splits normalized text into angles, hemisphere letters, labels and separators. */
function lex(text: string, ctx: ResolvedCtx): Token[] | { error: string } {
  // A comma between digits is a decimal comma only where the locale writes decimals with one.
  const pattern = ctx.locale.decimal === ',' ? COMMA_NUMBER : POINT_NUMBER;
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let match: RegExpExecArray | null;
    if (text[i] === ' ') {
      i++;
    } else if (text[i] === ',' || text[i] === ';') {
      tokens.push({ kind: 'separator' });
      i++;
    } else if ((match = LABEL.exec(rest))) {
      const word = match[1]!.toLowerCase();
      tokens.push({ kind: 'label', axis: word.startsWith('lat') ? 'lat' : 'lng', text: match[1]! });
      i += match[0].length;
    } else if ((match = HEMISPHERE.exec(rest))) {
      const letter = match[1]![0]!.toUpperCase();
      tokens.push({ kind: 'hemisphere', ...HEMISPHERES[letter.toLowerCase()]!, letter });
      i += match[0].length;
    } else if (pattern.test(rest)) {
      const read = readAngle(text, i, pattern);
      if ('error' in read) return read;
      const previous = tokens[tokens.length - 1];
      // `40.7128-74.0060`: two numbers need something between them.
      if (previous?.kind === 'angle' && previous.angle.end === i) return { error: `Separate the latitude and longitude with a comma, semicolon or space. ${EXAMPLE}` };
      tokens.push({ kind: 'angle', angle: read.angle });
      i = read.angle.end;
    } else {
      return { error: `Couldn't understand "${text}". ${EXAMPLE}` };
    }
  }
  return tokens;
}

/** One coordinate as written: its angle and the markers before and after it. */
interface Written {
  readonly angle: Angle;
  readonly before: readonly Marker[];
  readonly after: readonly Marker[];
}

/** The axis a coordinate's markers give it and its signed value, or what's wrong with it. */
function resolve({ angle, before, after }: Written): { axis: Axis | undefined; value: number } | { error: string } {
  const shape = [...before.map((m) => m.kind), '#', ...after.map((m) => m.kind)].join(' ');
  if (!/^(label )?(hemisphere )?#( hemisphere)?$/.test(shape) || shape.split('hemisphere').length > 2) {
    return { error: `Write at most one hemisphere (N, S, E or W) for each coordinate, and its label (lat or lng) before it.` };
  }
  const label = [...before, ...after].find((m) => m.kind === 'label');
  const hemisphere = [...before, ...after].find((m) => m.kind === 'hemisphere');
  if (label && hemisphere && label.axis !== hemisphere.axis) return { error: `"${label.text}" doesn't go with ${hemisphere.letter}.` };
  const magnitude = angle.degrees;
  if (!hemisphere) return { axis: label?.axis, value: angle.sign === '-' ? -magnitude : magnitude };
  if (angle.sign !== '' && (angle.sign === '-') !== hemisphere.negative) {
    return {
      error: angle.sign === '-'
        ? `A minus sign means south or west, so it can't go with ${hemisphere.letter}.`
        : `A plus sign means north or east, so it can't go with ${hemisphere.letter}.`,
    };
  }
  return { axis: hemisphere.axis, value: hemisphere.negative ? -magnitude : magnitude };
}

const zero = (n: number): number => (n === 0 ? 0 : n);
const inRange = (c: Coordinates): boolean => Math.abs(c.lat) <= 90 && Math.abs(c.lng) <= 180;
const rangeMessage = (c: Coordinates): string =>
  Math.abs(c.lat) > 90 ? `Latitude must be between -90 and 90; got ${c.lat}.` : `Longitude must be between -180 and 180; got ${c.lng}.`;

/** Reads a pair of coordinates: decimal degrees, degrees-minutes-seconds, with hemispheres or labels. */
function readPair(raw: string, ctx: ResolvedCtx, order: 'latLng' | 'lngLat'): ParseOutcome<Coordinates> {
  const brackets = BRACKETS.exec(raw);
  const text = brackets && (brackets[1] === '(') === (brackets[3] === ')') ? brackets[2]!.trim() : raw;
  const tokens = lex(text, ctx);
  if ('error' in tokens) return unparseable(tokens.error);

  const angles = tokens.flatMap((t, i) => (t.kind === 'angle' ? [i] : []));
  const decimalComma = ctx.locale.decimal === ',';
  if (angles.length === 0) return unparseable(`Couldn't understand "${raw}". ${EXAMPLE}`);
  if (angles.length === 1) {
    const hint = decimalComma && /\d,\d/.test(text) ? ` In ${ctx.locale.tag}, a comma between digits is a decimal comma: separate the two with a space or a semicolon.` : '';
    return unparseable(`Expected a latitude and a longitude, like 40.7128, -74.0060; found one coordinate.${hint}`);
  }
  if (angles.length > 2) {
    const hint = !decimalComma && /\d,\d/.test(text) ? ` In ${ctx.locale.tag}, a comma separates the coordinates: write decimals with a point.` : '';
    return unparseable(`Expected two coordinates, a latitude and a longitude; found ${angles.length} numbers.${hint}`);
  }

  const [first, second] = angles as [number, number];
  const separators = tokens.flatMap((t, i) => (t.kind === 'separator' ? [i] : []));
  if (separators.length > 1 || separators.some((i) => i < first || i > second)) {
    return unparseable(`Separate the latitude and longitude with one comma, semicolon or space. ${EXAMPLE}`);
  }
  const markers = (from: number, to: number): Marker[] => tokens.slice(from, to).filter((t): t is Marker => t.kind !== 'separator' && t.kind !== 'angle');
  const before = markers(0, first);
  const after = markers(second + 1, tokens.length);
  let between: [Marker[], Marker[]];
  const separator = separators[0];
  if (separator !== undefined) {
    between = [markers(first + 1, separator), markers(separator + 1, second)];
  } else {
    // Without a separator, a label starts the second coordinate, and of two letters between the
    // numbers, the first ends the first coordinate. A lone letter ends the first coordinate unless that
    // one already started with a letter (`N40 W74`).
    const middle = markers(first + 1, second);
    const label = middle.findIndex((m) => m.kind === 'label');
    const split = label >= 0 ? label : middle.length >= 2 ? 1 : before.some((m) => m.kind === 'hemisphere') ? 0 : middle.length;
    between = [middle.slice(0, split), middle.slice(split)];
  }

  const one = resolve({ angle: (tokens[first] as Extract<Token, { kind: 'angle' }>).angle, before, after: between[0] });
  if ('error' in one) return unparseable(one.error);
  const two = resolve({ angle: (tokens[second] as Extract<Token, { kind: 'angle' }>).angle, before: between[1], after });
  if ('error' in two) return unparseable(two.error);

  if (one.axis && two.axis) {
    if (one.axis === two.axis) {
      return unparseable(one.axis === 'lat' ? 'Both coordinates are latitudes (N or S): one needs E or W.' : 'Both coordinates are longitudes (E or W): one needs N or S.');
    }
    const value = one.axis === 'lat' ? { lat: zero(one.value), lng: zero(two.value) } : { lat: zero(two.value), lng: zero(one.value) };
    return inRange(value) ? { ok: true, value } : unparseable(rangeMessage(value));
  }
  if (one.axis || two.axis) return unparseable('Mark both coordinates (N or S and E or W, or lat and lng), or neither.');

  const [a, b] = [zero(one.value), zero(two.value)];
  const value = order === 'latLng' ? { lat: a, lng: b } : { lat: b, lng: a };
  if (inRange(value)) return { ok: true, value };
  const swapped = { lat: value.lng, lng: value.lat };
  if (!inRange(swapped)) return unparseable(rangeMessage(value));
  const leading = order === 'latLng' ? 'latitude' : 'longitude';
  return unparseable(`${rangeMessage(value)} This field reads ${leading} first; is it the other way round?`, [swapped]);
}

/** Reads a plus code, if the text has one. */
function readPlusCodeIn(text: string): ParseOutcome<Coordinates> | undefined {
  const words = text.split(' ');
  const code = words.find((word) => PLUS_CODE_LIKE.test(word));
  if (code === undefined) return undefined;
  const read = readPlusCode(code);
  if (!read.ok) return unparseable(read.message);
  if (words.length > 1) return unparseable(`A plus code stands alone: remove the text around "${code}".`);
  return { ok: true, value: read.value };
}

/** `40.7128° N`: decimal degrees to 6 places (about 0.1 m), with a hemisphere letter. */
const decimalDegrees = (value: number, axis: Axis, ctx: ResolvedCtx): string => {
  const text = formatNumber(Math.abs(value), ctx, { maxFractionDigits: 6 });
  return `${text}° ${hemisphere(value, text === '0', axis)}`;
};

/**
 * Geographic coordinates in decimal degrees (WGS 84): `{ lat, lng }`.
 *
 * Reads decimal pairs (`40.7128, -74.0060`), hemisphere letters before or after each part, in either
 * order (`40.7128° N, 74.0060° W`, `W74.0060 N40.7128`), labels (`lat 40.7128, lng -74.0060`), degrees,
 * minutes and seconds (`40°42'46" N 74°0'22" W`), degrees and decimal minutes (`40°42.767' N`), full plus
 * codes (`849VCWC8+R9`, the center of the code's area) and, with `geohash`, geohashes.
 *
 * The two coordinates are separated by a comma, a semicolon or a space. A comma between digits is a
 * decimal comma in locales that write decimals with one (`40,7128 -74,0060` in de-DE) and a separator
 * elsewhere; a point is always a decimal point. Formats as `40.7128° N, 74.006° W`, to 6 decimal places.
 */
export const coordinates = (options?: CoordinatesOptions): Codec<Coordinates> => {
  const order = options?.order ?? 'latLng';
  return defineCodec<Coordinates>({
    id: 'coordinates',
    options,
    parse(raw, ctx) {
      const text = normalize(raw).trim();
      const plusCode = readPlusCodeIn(text);
      if (plusCode) return plusCode;
      const pair = readPair(text, ctx, order);
      if (!GEOHASH_LIKE.test(text)) return pair;
      if (!options?.geohash) {
        return pair.ok || !/\d/.test(text) ? pair : unparseable(`Couldn't understand "${text}". If it's a geohash, this field doesn't read them. ${EXAMPLE}`);
      }
      if (text.length < GEOHASH_MIN_LENGTH) {
        return pair.ok ? pair : unparseable(`A geohash needs at least ${GEOHASH_MIN_LENGTH} characters to locate a place; "${text}" is a cell hundreds of kilometers across.`);
      }
      const geohash = readGeohash(text);
      if (!pair.ok) return { ok: true, value: geohash };
      return {
        ok: false,
        issues: [{ code: 'ambiguous', message: `"${text}" reads as coordinates and as a geohash.` }],
        alternatives: [pair.value, geohash],
      };
    },
    format(value, ctx) {
      const [lat, lng] = [decimalDegrees(value.lat, 'lat', ctx), decimalDegrees(value.lng, 'lng', ctx)];
      return order === 'latLng' ? `${lat}, ${lng}` : `${lng}, ${lat}`;
    },
    check: checkCoordinates,
  });
};
