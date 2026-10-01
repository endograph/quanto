import { defineCodec, formatNumber, normalize, readNumber, type Codec, type CodecOptions, type ParseOutcome, type Quantity, type ResolvedCtx, type UnitDefinition } from 'quanto';
import { convert } from 'quanto/quantity';
import { ctxKey } from '../ctx';
import { H_LANGUAGES, LETTER_PITCH, nameOf, spell, type Letter } from '../spelling';

/**
 * Pitch units: `note` is a MIDI note number (A4 is 69, middle C 60), with cents as the fraction
 * (A4 +15¢ is 69.15); `Hz` is the frequency. Base unit: the hertz.
 */
export type PitchUnit = 'note' | 'Hz';

export interface PitchOptions<C extends PitchUnit = PitchUnit> extends CodecOptions<Quantity<C>> {
  /** The tuning: A4's frequency in Hz. Default 440. */
  readonly a4?: number | undefined;
  /** The octave number of middle C: 4 (scientific pitch notation, the default) or 3 (Yamaha, and French usage). */
  readonly middleC?: 3 | 4 | undefined;
  /** The octave of a note written without one (`F#`). Without it, a note needs its octave. */
  readonly defaultOctave?: number | undefined;
  /** What a bare number means. Without it, `440` is a `missing_unit` issue. */
  readonly defaultUnit?: PitchUnit | undefined;
  /** Always convert the parsed value to this unit: `Hz` makes `A4` 440 Hz. Narrows the value type. */
  readonly canonicalUnit?: C | undefined;
}

/** A pitch codec. It carries its unit table, so `convert` and `compare` from `quanto/quantity` work on its values. */
export interface PitchCodec<C extends PitchUnit = PitchUnit> extends Codec<Quantity<C>> {
  readonly units: Readonly<Record<PitchUnit, UnitDefinition>>;
}

/** The unit table for a tuning: `note` converts to Hz through A4. */
export function pitchUnits(a4 = 440): Readonly<Record<PitchUnit, UnitDefinition>> {
  return {
    note: { toBase: (n) => a4 * 2 ** ((n - 69) / 12), fromBase: (hz) => 69 + 12 * Math.log2(hz / a4), aliases: ['note'] },
    Hz: { toBase: 1, aliases: ['Hz', 'hertz'] },
  };
}

// Note names, after `normalize`. Solfège first, longest syllable first, so `Sol` isn't `So` + `l`.
const SYLLABLES: Readonly<Record<string, Letter>> = {
  do: 'C', 'dó': 'C', ut: 'C', re: 'D', 'ré': 'D', mi: 'E', fa: 'F', 'fá': 'F', sol: 'G', so: 'G', la: 'A', 'lá': 'A', si: 'B', ti: 'B',
};
const SOLFEGE = /^(sol|do|dó|ut|ré|re|mi|fá|fa|so|lá|la|si|ti)/iu;
const LETTER = /^[a-h]/i;
/** German accidentals: `is` and `isis` on any letter but B, a bare `s` on A and E (`As`, `Es`, `Ases`), `es` on the rest. */
const GERMAN_SHARP = /^(isis|is)/i;
const GERMAN_FLAT_AE = /^(ses|sas|s)/i;
const GERMAN_FLAT = /^(eses|es)/i;
const SYMBOL = /^(##|#|♯♯|♯|x|𝄪|bb|b|♭♭|♭|𝄫|♮)/iu;
const WORD = /^[ -]?(double sharp|double flat|sharp|flat|natural|dièse|diese|bémol|bemol|diesis|bemolle|sostenido|sustenido)(?!\p{L})/iu;
const ACCIDENTALS: Readonly<Record<string, number>> = {
  '#': 1, '♯': 1, '##': 2, '♯♯': 2, x: 2, '𝄪': 2, b: -1, '♭': -1, bb: -2, '♭♭': -2, '𝄫': -2, '♮': 0,
  'double sharp': 2, 'double flat': -2, sharp: 1, flat: -1, natural: 0,
  'dièse': 1, diese: 1, diesis: 1, sostenido: 1, sustenido: 1, 'bémol': -1, bemol: -1, bemolle: -1,
};
const OCTAVE = /^ ?(-?\d+)(?![\d.,])/;
const CENTS_UNIT = /^ ?(¢|cents?|ct|c)(?![\p{L}\p{N}])/iu;
const MIDI = /^midi(?: note)? /i;
const HZ_UNITS: ReadonlyArray<readonly [RegExp, number]> = [
  [/^(hz|hertz)$/i, 1],
  [/^(khz|kilohertz)$/i, 1000],
];

const unparseable = (text: string, hint?: string): ParseOutcome<never> => ({
  ok: false,
  issues: [{ code: 'unparseable', message: `Couldn't understand "${text}".${hint ? ` ${hint}` : ''}` }],
});

interface NoteRead {
  /** The MIDI number, with cents as the fraction; undefined when the octave is missing. */
  readonly value: number | undefined;
}

/**
 * A note name for the whole text: a letter or solfège syllable, at most one accidental, an octave and
 * cents (`B♭3`, `Fis4`, `Sol4`, `A4 +15¢`). Undefined if the text isn't one.
 */
function readNote(text: string, ctx: ResolvedCtx, middleC: number, defaultOctave: number | undefined): NoteRead | undefined {
  let i = 0;
  let letter: Letter;
  let accidental: number | undefined;
  const syllable = SOLFEGE.exec(text);
  const german = !syllable && LETTER.exec(text);
  if (syllable) {
    letter = SYLLABLES[syllable[1]!.toLowerCase()]!;
    i = syllable[0].length;
  } else if (german) {
    const c = german[0].toLowerCase();
    i = 1;
    letter = c === 'h' ? 'B' : (c.toUpperCase() as Letter);
    const rest = text.slice(i);
    const suffix = c !== 'b' && GERMAN_SHARP.exec(rest) || (c === 'a' || c === 'e' ? GERMAN_FLAT_AE.exec(rest) : c !== 'b' && GERMAN_FLAT.exec(rest)) || null;
    // `H` takes only `eses` (B♭ is `B`).
    if (suffix && !(c === 'h' && suffix[1]!.toLowerCase() === 'es')) {
      const s = suffix[1]!.toLowerCase();
      accidental = s.startsWith('is') ? s.length / 2 : s === 's' || s === 'es' ? -1 : -2;
      i += suffix[0].length;
    }
    // A bare `B` is B♭ where B natural is `H`.
    if (c === 'b' && H_LANGUAGES.has(ctx.locale.language) && !SYMBOL.exec(text.slice(i)) && !WORD.exec(text.slice(i))) accidental = -1;
  } else return undefined;

  if (accidental === undefined) {
    const mark = SYMBOL.exec(text.slice(i)) ?? WORD.exec(text.slice(i));
    if (mark) {
      accidental = ACCIDENTALS[mark[1]!.toLowerCase()]!;
      i += mark[0].length;
    }
  }

  const octave = OCTAVE.exec(text.slice(i));
  if (octave) i += octave[0].length;
  const octaveNumber = octave ? Number(octave[1]) : defaultOctave;

  let cents = 0;
  if (i < text.length) {
    const sign = /^ ?([+-]) ?/.exec(text.slice(i));
    if (!sign) return undefined;
    const n = readNumber(text, ctx, { from: i + sign[0].length });
    if (!n || /^[+-]/.test(text.slice(i + sign[0].length).trimStart())) return undefined;
    const unit = CENTS_UNIT.exec(text.slice(n.end));
    if (!unit || n.end + unit[0].length !== text.length) return undefined;
    cents = sign[1] === '-' ? -n.value : n.value;
  }
  if (octaveNumber === undefined) return { value: undefined };
  return { value: 12 * (octaveNumber - middleC + 5) + LETTER_PITCH[letter] + (accidental ?? 0) + cents / 100 };
}

/** A frequency (`440 Hz`, `1 kHz`), a MIDI number (`MIDI 60`) or a bare number. */
function readNumeric(text: string, ctx: ResolvedCtx, defaultUnit: PitchUnit | undefined): ParseOutcome<Quantity<PitchUnit>> {
  const midi = MIDI.exec(text);
  const n = readNumber(text, ctx, { from: midi ? midi[0].length : 0 });
  if (!n) return unparseable(text);
  const rest = text.slice(n.end).trim();
  if (midi) return rest === '' ? { ok: true, value: { value: n.value, unit: 'note' } } : unparseable(text);
  if (rest === '') {
    if (!defaultUnit) return { ok: false, issues: [{ code: 'missing_unit', message: 'Add a unit, like Hz, or write a note, like A4.' }] };
    return positive(text, { value: n.value, unit: defaultUnit });
  }
  const unit = HZ_UNITS.find(([alias]) => alias.test(rest));
  if (!unit) {
    // A letter after the number names a unit we don't know; anything else isn't a pitch.
    return /^\p{L}/u.test(rest) ? { ok: false, issues: [{ code: 'unknown_unit', message: `"${rest}" isn't a unit of pitch. Use Hz, or write a note, like A4.` }] } : unparseable(text);
  }
  return positive(text, { value: n.value * unit[1], unit: 'Hz' });
}

const positive = (text: string, q: Quantity<PitchUnit>): ParseOutcome<Quantity<PitchUnit>> =>
  q.unit === 'Hz' && !(q.value > 0) ? unparseable(text, 'A frequency is more than 0 Hz.') : { ok: true, value: q };

/**
 * Pitches: `A4`, `C♯5`, `B♭3`, `A4 +15¢`, `440 Hz`, `MIDI 60`. A quantity in MIDI note numbers or Hz
 * (`{ value: 69, unit: 'note' }`), so `convert` and `compare` work, through the tuning (`a4`).
 *
 * Names follow the locale: German and Nordic `H` and `B` (`B4` is B♭4 in de-DE) and `-is`/`-es`
 * (`Fis`, `Es`), and solfège (`Sol4`, `Si♭3`, `Fa dièse 4`), which reads in every locale. `format`
 * prints the locale's names, spelled for `ctx.music.key` (`B♭4` in F major), with sharps by default.
 */
export function pitch<C extends PitchUnit = PitchUnit>(options?: PitchOptions<C>): PitchCodec<C> {
  const a4 = options?.a4 ?? 440;
  const middleC = options?.middleC ?? 4;
  const defaultOctave = options?.defaultOctave;
  if (!(a4 > 0) || !Number.isFinite(a4)) throw new Error(`@quantojs/music: pitch's a4 must be a frequency in Hz, more than 0; got ${a4}.`);
  if (middleC !== 3 && middleC !== 4) throw new Error(`@quantojs/music: pitch's middleC must be 3 or 4; got ${String(middleC)}.`);
  if (defaultOctave !== undefined && !Number.isInteger(defaultOctave)) throw new Error(`@quantojs/music: pitch's defaultOctave must be a whole number; got ${defaultOctave}.`);
  const units = pitchUnits(a4);
  const table = { id: 'pitch', units };

  const codec = defineCodec<Quantity<C>>({
    id: 'pitch',
    options,
    parse(raw, ctx) {
      const text = normalize(raw).trim();
      const note = readNote(text, ctx, middleC, defaultOctave);
      let outcome: ParseOutcome<Quantity<PitchUnit>>;
      if (note?.value !== undefined) outcome = { ok: true, value: { value: note.value, unit: 'note' } };
      else if (note) return unparseable(text, 'Add an octave, like A4.');
      else outcome = readNumeric(text, ctx, options?.defaultUnit);
      if (!outcome.ok) return { ok: false, issues: outcome.issues };
      const canonical = options?.canonicalUnit;
      return { ok: true, value: (canonical ? convert(table, outcome.value, canonical) : outcome.value) as Quantity<C> };
    },
    format(value, ctx) {
      if (value.unit === 'Hz') return `${formatNumber(value.value, ctx, { maxFractionDigits: 2 })} Hz`;
      const n = Math.round(value.value);
      const cents = Math.round((value.value - n) * 1000) / 10;
      const spelling = spell(n, ctxKey(ctx));
      const octave = (n - LETTER_PITCH[spelling.letter] - spelling.accidental) / 12 - 5 + middleC;
      const name = `${nameOf(spelling, ctx.locale.language)}${octave}`;
      return cents === 0 ? name : `${name} ${cents > 0 ? '+' : '-'}${formatNumber(Math.abs(cents), ctx, { maxFractionDigits: 1 })}¢`;
    },
    check(value) {
      const q = value as Quantity<string> | null;
      if (!q || typeof q !== 'object' || (q.unit !== 'note' && q.unit !== 'Hz')) return [{ message: 'Expected { value, unit } with unit "note" or "Hz".' }];
      if (typeof q.value !== 'number' || !Number.isFinite(q.value)) return [{ message: 'Expected a finite number.', path: ['value'] }];
      if (q.unit === 'Hz' && q.value <= 0) return [{ message: 'Expected a frequency more than 0 Hz.', path: ['value'] }];
      return [];
    },
  });
  return { ...codec, units };
}
