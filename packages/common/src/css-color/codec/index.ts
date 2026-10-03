import { defineCodec, type Codec, type CodecOptions, type Issue, type ParseOutcome } from 'quanto';
import { cssColorNames } from '../names';
import { checkCssColor, type CssColor, type CssColorSpace } from '../value';

export interface CssColorOptions extends CodecOptions<CssColor> {
  /**
   * Also read colors written without CSS syntax, as design tools copy them: hex without `#` (`00aaff`,
   * `0af`) and three channels from 0 to 255 (`0 170 255`, `0, 170, 255`). On by default; turn it off
   * where other values share the field, since words like `bad` and numbers like `123` are hex.
   */
  readonly bare?: boolean | undefined;
}

const EXAMPLE = 'Write a CSS color like #00aaff, rgb(0 170 255), hsl(200 100% 50%), oklch(0.7 0.15 230) or rebeccapurple.';

const unparseable = <T = CssColor>(message: string): ParseOutcome<T> => ({ ok: false, issues: [{ code: 'unparseable', message } satisfies Issue] });

/** Colors that have no value of their own: they depend on the element, the user's theme or the page. */
const CONTEXTUAL = new Set([
  'currentcolor',
  'canvas', 'canvastext', 'linktext', 'visitedtext', 'activetext', 'buttonface', 'buttontext', 'buttonborder', 'field', 'fieldtext',
  'highlight', 'highlighttext', 'selecteditem', 'selecteditemtext', 'mark', 'marktext', 'graytext', 'accentcolor', 'accentcolortext',
  'inherit', 'initial', 'unset', 'revert', 'revert-layer',
]);

/** Valid CSS color functions that this codec doesn't compute. */
const UNSUPPORTED: Readonly<Record<string, string>> = {
  'color-mix': 'color-mix() isn\'t supported: write the mixed color itself.',
  'light-dark': 'light-dark() depends on the color scheme, so it has no value of its own: write one of the two colors.',
  'device-cmyk': 'device-cmyk() depends on the printer, so it has no value of its own: write the color in RGB.',
  'contrast-color': 'contrast-color() depends on another color: write the color itself.',
  var: 'var() depends on the page\'s custom properties: write the color itself.',
  env: 'env() depends on the browser: write the color itself.',
  attr: 'attr() depends on the element: write the color itself.',
  calc: 'calc() isn\'t supported: write the color itself.',
};

// ---- Hex and names ----------------------------------------------------------------------------------

const HEX = /^[0-9a-f]+$/i;

function fromHex(digits: string): CssColor | undefined {
  if (!HEX.test(digits) || ![3, 4, 6, 8].includes(digits.length)) return undefined;
  const full = digits.length <= 4 ? [...digits].map((d) => d + d).join('') : digits;
  const [r, g, b, a = 255] = full.match(/../g)!.map((pair) => parseInt(pair, 16)) as [number, number, number, number?];
  return { space: 'srgb', coords: [r / 255, g / 255, b / 255], alpha: a / 255 };
}

function readWord(word: string): ParseOutcome<CssColor> | undefined {
  const lower = word.toLowerCase();
  if (lower === 'transparent') return { ok: true, value: { space: 'srgb', coords: [0, 0, 0], alpha: 0 } };
  const hex = Object.hasOwn(cssColorNames, lower) ? cssColorNames[lower] : undefined;
  if (hex) return { ok: true, value: fromHex(hex.slice(1))! };
  if (CONTEXTUAL.has(lower)) return unparseable(`"${word}" depends on where the color is used, so it has no value of its own. ${EXAMPLE}`);
  return undefined;
}

// ---- Function arguments -----------------------------------------------------------------------------

type Token =
  | { readonly kind: 'number'; readonly value: number; readonly unit: string; readonly text: string }
  | { readonly kind: 'ident'; readonly name: string }
  | { readonly kind: ',' | '/' };

const NUMBER = /^[+-]?(?:\d+(?:\.\d+)?|\.\d+)(?:e[+-]?\d+)?/i;
const UNIT = /^(?:%|[a-z]+)/i;
const IDENT = /^-{0,2}[a-z][a-z0-9-]*/i;

function lex(args: string): Token[] | undefined {
  const tokens: Token[] = [];
  let i = 0;
  while (i < args.length) {
    const rest = args.slice(i);
    let match: RegExpExecArray | null;
    if (/^\s/.test(rest)) {
      i++;
    } else if (rest[0] === ',' || rest[0] === '/') {
      tokens.push({ kind: rest[0] });
      i++;
    } else if ((match = NUMBER.exec(rest))) {
      const unit = UNIT.exec(rest.slice(match[0].length))?.[0] ?? '';
      const text = match[0] + unit;
      tokens.push({ kind: 'number', value: Number(match[0]), unit: unit.toLowerCase(), text });
      i += text.length;
    } else if ((match = IDENT.exec(rest))) {
      tokens.push({ kind: 'ident', name: match[0].toLowerCase() });
      i += match[0].length;
    } else {
      return undefined;
    }
  }
  return tokens;
}

/**
 * How a component reads: `percent` is its value at 100%, `divisor` divides a plain number (255 for
 * `rgb()`), and `clamp` is where CSS clamps it. A hue reads plain numbers and angles as degrees.
 */
type Component =
  | { readonly hue: true }
  | { readonly hue?: false; readonly percent: number; readonly divisor?: number; readonly clamp?: readonly [number, number] };

const HUE: Component = { hue: true };
const ALPHA: Component = { percent: 1, clamp: [0, 1] };
const RGB: Component = { percent: 1, divisor: 255, clamp: [0, 1] };
const CHANNEL: Component = { percent: 1 };
const PERCENTAGE: Component = { percent: 100, clamp: [0, 100] };

const ANGLES: Readonly<Record<string, number>> = { '': 1, deg: 1, grad: 0.9, rad: 180 / Math.PI, turn: 360 };

const normalizeHue = (degrees: number): number => {
  const h = ((degrees % 360) + 360) % 360;
  return h === 360 || h === 0 ? 0 : h;
};

/** A component's value, or a message. `none` is 0. */
function component(token: Token, spec: Component, what: string): number | string {
  if (token.kind === 'ident') return token.name === 'none' ? 0 : `"${token.name}" isn't a number for ${what}.`;
  if (token.kind !== 'number') return `Expected a number for ${what}.`;
  const subject = what[0]!.toUpperCase() + what.slice(1);
  if (spec.hue) {
    const factor = ANGLES[token.unit];
    return factor === undefined ? `${subject} takes a number or an angle (deg, grad, rad or turn), not "${token.text}".` : normalizeHue(token.value * factor);
  }
  let value: number;
  if (token.unit === '%') value = (token.value / 100) * spec.percent;
  else if (token.unit === '') value = token.value / (spec.divisor ?? 1);
  else return `${subject} takes a number or a percentage, not "${token.text}".`;
  if (spec.clamp) value = Math.min(spec.clamp[1], Math.max(spec.clamp[0], value));
  return value === 0 ? 0 : value;
}

interface ColorFunction {
  readonly space: CssColorSpace;
  readonly components: readonly [Component, Component, Component];
  /** The components' names, for messages. */
  readonly names: readonly [string, string, string];
  /** Takes the legacy comma syntax: `rgb()` and `hsl()`, with their `a` aliases. */
  readonly legacy?: boolean;
  readonly example: string;
}

const FUNCTIONS: Readonly<Record<string, ColorFunction>> = {
  rgb: { space: 'srgb', components: [RGB, RGB, RGB], names: ['red', 'green', 'blue'], legacy: true, example: 'rgb(0 170 255 / 50%)' },
  hsl: { space: 'hsl', components: [HUE, PERCENTAGE, PERCENTAGE], names: ['hue', 'saturation', 'lightness'], legacy: true, example: 'hsl(200 100% 50% / 50%)' },
  hwb: { space: 'hwb', components: [HUE, PERCENTAGE, PERCENTAGE], names: ['hue', 'whiteness', 'blackness'], example: 'hwb(200 10% 20% / 50%)' },
  lab: { space: 'lab', components: [PERCENTAGE, { percent: 125 }, { percent: 125 }], names: ['lightness', 'a', 'b'], example: 'lab(50 40 -20 / 50%)' },
  lch: { space: 'lch', components: [PERCENTAGE, { percent: 150, clamp: [0, Infinity] }, HUE], names: ['lightness', 'chroma', 'hue'], example: 'lch(50 30 200 / 50%)' },
  oklab: { space: 'oklab', components: [{ percent: 1, clamp: [0, 1] }, { percent: 0.4 }, { percent: 0.4 }], names: ['lightness', 'a', 'b'], example: 'oklab(0.7 0.1 -0.1 / 50%)' },
  oklch: { space: 'oklch', components: [{ percent: 1, clamp: [0, 1] }, { percent: 0.4, clamp: [0, Infinity] }, HUE], names: ['lightness', 'chroma', 'hue'], example: 'oklch(0.7 0.15 230 / 50%)' },
};
const ALIASES: Readonly<Record<string, string>> = { rgba: 'rgb', hsla: 'hsl' };

/** `color()`'s predefined spaces; `xyz` is `xyz-d65`. */
const PREDEFINED: Readonly<Record<string, CssColorSpace>> = {
  srgb: 'srgb',
  'srgb-linear': 'srgb-linear',
  'display-p3': 'display-p3',
  'a98-rgb': 'a98-rgb',
  'prophoto-rgb': 'prophoto-rgb',
  rec2020: 'rec2020',
  xyz: 'xyz-d65',
  'xyz-d50': 'xyz-d50',
  'xyz-d65': 'xyz-d65',
};

/** Reads three components and an alpha, in the modern syntax (`a b c / alpha`) or, if allowed, the legacy one (`a, b, c, alpha`). */
function readComponents(name: string, tokens: readonly Token[], fn: Omit<ColorFunction, 'space'>): ParseOutcome<{ coords: [number, number, number]; alpha: number }> {
  const usage = `${name}() takes three values and an optional alpha after a slash, like ${fn.example}.`;
  if (tokens.some((t) => t.kind === ',')) {
    if (!fn.legacy) return unparseable(`${name}() doesn't take commas. ${usage}`);
    return readLegacy(name, tokens, fn);
  }
  const slash = tokens.findIndex((t) => t.kind === '/');
  const values = slash < 0 ? tokens : tokens.slice(0, slash);
  const alpha = slash < 0 ? [] : tokens.slice(slash + 1);
  if (values.length !== 3 || (slash >= 0 && alpha.length !== 1)) return unparseable(usage);
  return finish(name, values, alpha[0], fn);
}

function readLegacy(name: string, tokens: readonly Token[], fn: Omit<ColorFunction, 'space'>): ParseOutcome<{ coords: [number, number, number]; alpha: number }> {
  const legacy = name.startsWith('rgb') ? `${name}(0, 170, 255, 0.5)` : `${name}(200, 100%, 50%, 0.5)`;
  const usage = `With commas, ${name}() takes three values and an optional alpha, each separated by a comma, like ${legacy}.`;
  const values = tokens.filter((_, i) => i % 2 === 0);
  const commas = tokens.filter((_, i) => i % 2 === 1);
  if (tokens.length % 2 === 0 || commas.some((t) => t.kind !== ',') || values.length < 3 || values.length > 4) return unparseable(usage);
  if (values.some((t) => t.kind !== 'number')) return unparseable(`With commas, ${name}() takes numbers only, not "none". ${usage}`);
  const units = values.slice(0, 3).map((t) => (t.kind === 'number' && t.unit === '%' ? '%' : 'number'));
  if (fn.components[0] === RGB && new Set(units).size > 1) return unparseable(`With commas, ${name}() takes three numbers or three percentages, not a mix: ${name}(0, 170, 255) or ${name}(0%, 67%, 100%).`);
  if (fn.components[0] === HUE && units.slice(1).some((u) => u !== '%')) return unparseable(`With commas, ${name}() takes its saturation and lightness as percentages, like ${legacy}.`);
  return finish(name, values.slice(0, 3), values[3], fn);
}

function finish(name: string, values: readonly Token[], alphaToken: Token | undefined, fn: Omit<ColorFunction, 'space'>): ParseOutcome<{ coords: [number, number, number]; alpha: number }> {
  const read = values.map((t, i) => component(t, fn.components[i]!, `the ${fn.names[i]} of ${name}()`));
  const alpha = alphaToken ? component(alphaToken, ALPHA, 'the alpha') : 1;
  const error = [...read, alpha].find((r): r is string => typeof r === 'string');
  if (error !== undefined) return unparseable(error);
  return { ok: true, value: { coords: read as [number, number, number], alpha: alpha as number } };
}

const FUNCTION = /^([a-z][a-z0-9-]*)\((.*)\)$/is;

function readFunction(text: string): ParseOutcome<CssColor> {
  const call = FUNCTION.exec(text);
  const head = /^([a-z][a-z0-9-]*)\(/i.exec(text)![1]!;
  const name = head.toLowerCase();
  const unsupported = UNSUPPORTED[name];
  if (unsupported) return unparseable(unsupported);
  const known = name === 'color' || Object.hasOwn(FUNCTIONS, ALIASES[name] ?? name);
  if (!known) return unparseable(`"${head}()" isn't a CSS color function. ${EXAMPLE}`);
  if (!call) return unparseable(`${head}( is missing its closing parenthesis.`);

  const tokens = lex(call[2]!);
  if (!tokens) return unparseable(`Couldn't read the values in "${text}". ${EXAMPLE}`);
  if (tokens[0]?.kind === 'ident' && tokens[0].name === 'from') return unparseable(`Relative colors (${name}(from …)) aren't supported: write the color itself.`);

  if (name === 'color') {
    const [first, ...rest] = tokens;
    const spaces = `srgb, srgb-linear, display-p3, a98-rgb, prophoto-rgb, rec2020, xyz, xyz-d50 or xyz-d65`;
    if (first?.kind !== 'ident') return unparseable(`color() starts with a color space (${spaces}), like color(display-p3 1 0 0).`);
    if (first.name.startsWith('--')) return unparseable(`color(${first.name} …) needs the page's @color-profile: write the color in one of ${spaces}.`);
    const space = Object.hasOwn(PREDEFINED, first.name) ? PREDEFINED[first.name]! : undefined;
    if (!space) return unparseable(`"${first.name}" isn't a color space color() supports: ${spaces}.`);
    const read = readComponents('color', rest, { components: [CHANNEL, CHANNEL, CHANNEL], names: ['first channel', 'second channel', 'third channel'], example: `color(${first.name} 1 0 0 / 50%)` });
    return read.ok ? { ok: true, value: { space, ...read.value } } : { ok: false, issues: read.issues };
  }

  const fn = FUNCTIONS[ALIASES[name] ?? name]!;
  const read = readComponents(name, tokens, fn);
  return read.ok ? { ok: true, value: { space: fn.space, ...read.value } } : { ok: false, issues: read.issues };
}

// ---- Bare channels ----------------------------------------------------------------------------------

const BARE_CHANNEL = /^\d+(?:\.\d+)?$/;

function readBareChannels(text: string): ParseOutcome<CssColor> | undefined {
  const parts = text.split(/\s*,\s*|\s+/);
  if (parts.length !== 3 || !parts.every((p) => BARE_CHANNEL.test(p))) return undefined;
  const channels = parts.map(Number);
  if (channels.some((c) => c > 255)) return unparseable(`Each of red, green and blue is from 0 to 255: "${text}".`);
  const [r, g, b] = channels as [number, number, number];
  return { ok: true, value: { space: 'srgb', coords: [r / 255, g / 255, b / 255], alpha: 1 } };
}

// ---- Formatting -------------------------------------------------------------------------------------

/** Twelve significant digits: enough to read back the same value, without float noise (`25.500000000000004`). */
const num = (n: number): string => {
  const rounded = Number(n.toPrecision(12));
  return String(rounded === 0 ? 0 : rounded);
};

/** `n` in 0–1 as a whole byte, if it is one. */
const byte = (n: number): number | undefined => {
  const scaled = n * 255;
  const whole = Math.round(scaled);
  return whole >= 0 && whole <= 255 && Math.abs(scaled - whole) < 1e-9 ? whole : undefined;
};

const withAlpha = (inner: string, alpha: number): string => (alpha === 1 ? inner : `${inner} / ${num(alpha)}`);

function formatSrgb({ coords, alpha }: CssColor): string {
  const bytes = [...coords, alpha].map(byte);
  if (bytes.every((b) => b !== undefined)) {
    const hex = bytes.map((b) => b!.toString(16).padStart(2, '0'));
    return `#${(alpha === 1 ? hex.slice(0, 3) : hex).join('')}`;
  }
  if (coords.every((c) => c >= 0 && c <= 1)) return `rgb(${withAlpha(coords.map((c) => num(c * 255)).join(' '), alpha)})`;
  return `color(srgb ${withAlpha(coords.map(num).join(' '), alpha)})`;
}

/**
 * The default formatter: hex for an sRGB color whose channels and alpha are whole bytes (`#00aaff`,
 * `#00aaff80`), `rgb()` for other sRGB colors in gamut, `color(srgb …)` out of gamut, and the space's
 * own function otherwise (`hsl(200 100% 50%)`, `oklch(0.7 0.15 230 / 0.5)`, `color(display-p3 1 0 0)`).
 * Names aren't kept: `red` formats as `#ff0000`.
 */
export function formatCssColor(color: CssColor): string {
  const [a, b, c] = color.coords;
  switch (color.space) {
    case 'srgb':
      return formatSrgb(color);
    case 'hsl':
    case 'hwb':
      return `${color.space}(${withAlpha(`${num(a)} ${num(b)}% ${num(c)}%`, color.alpha)})`;
    case 'lab':
    case 'lch':
    case 'oklab':
    case 'oklch':
      return `${color.space}(${withAlpha(`${num(a)} ${num(b)} ${num(c)}`, color.alpha)})`;
    default:
      return `color(${color.space} ${withAlpha(`${num(a)} ${num(b)} ${num(c)}`, color.alpha)})`;
  }
}

// ---- The codec --------------------------------------------------------------------------------------

/**
 * CSS colors, every kind with a value of its own: hex (`#0af`, `#00aaff80`), the 148 named colors and
 * `transparent`, `rgb()`, `hsl()`, `hwb()`, `lab()`, `lch()`, `oklab()`, `oklch()` and `color()` in its
 * predefined spaces, in the modern and legacy (comma) syntaxes. The value stays in the space it was
 * written in. Colors that depend on context (`currentcolor`, system colors, `light-dark()`), and those
 * computed from others (`color-mix()`, relative colors), are `unparseable`. With `bare` (on by default),
 * hex without `#` and three channels from 0 to 255 read too. The locale doesn't matter: CSS is the same
 * everywhere.
 */
export function cssColor(options?: CssColorOptions): Codec<CssColor> {
  const bare = options?.bare ?? true;
  return defineCodec<CssColor>({
    id: 'cssColor',
    options,
    check: checkCssColor,
    format: formatCssColor,
    parse(text) {
      if (text.startsWith('#')) {
        const hex = fromHex(text.slice(1));
        return hex ? { ok: true, value: hex } : unparseable(`"${text}" isn't a hex color: write #, then 3, 4, 6 or 8 hex digits, like #0af or #00aaff.`);
      }
      if (/^[a-z][a-z0-9-]*\(/i.test(text)) return readFunction(text);
      if (/^[a-z-]+$/i.test(text)) {
        const word = readWord(text);
        if (word) return word;
      }
      if (bare) {
        const hex = fromHex(text);
        if (hex) return { ok: true, value: hex };
        const channels = readBareChannels(text);
        if (channels) return channels;
      }
      return unparseable(`Couldn't read "${text}" as a color. ${EXAMPLE}`);
    },
  });
}
