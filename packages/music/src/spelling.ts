import { normalize } from 'quanto';

/** A note letter, in the English names. German `H` is `B` here, and `B` is `B` with a flat. */
export type Letter = 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B';

export const LETTERS: readonly Letter[] = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

/** Each letter's pitch class: semitones above C. */
export const LETTER_PITCH: Readonly<Record<Letter, number>> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** How a note is written: a letter and an accidental in semitones, -2 (double flat) to 2 (double sharp). */
export interface Spelling {
  readonly letter: Letter;
  readonly accidental: number;
}

/** Semitones above the tonic, for each mode. */
const MODES: Readonly<Record<string, readonly number[]>> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  ionian: [0, 2, 4, 5, 7, 9, 11],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  phrygian: [0, 1, 3, 5, 7, 8, 10],
  lydian: [0, 2, 4, 6, 7, 9, 11],
  mixolydian: [0, 2, 4, 5, 7, 9, 10],
  minor: [0, 2, 3, 5, 7, 8, 10],
  aeolian: [0, 2, 3, 5, 7, 8, 10],
  locrian: [0, 1, 3, 5, 6, 8, 10],
};

const MODE_WORDS: Readonly<Record<string, string>> = { '': 'major', maj: 'major', m: 'minor', min: 'minor' };

const KEY = /^([A-Ga-g])(##|#|x|bb|b|♯♯|♯|𝄪|♭♭|♭|𝄫)? ?(?:(m)|([A-Za-z]+))?$/u;

/** A key's spelling: its notes by pitch class, and which way it spells the notes outside it. */
export interface Key {
  readonly notes: ReadonlyMap<number, Spelling>;
  readonly flats: boolean;
}

const mod12 = (n: number): number => ((n % 12) + 12) % 12;

const ACCIDENTAL_SYMBOLS: Readonly<Record<string, number>> = {
  '#': 1, '♯': 1, '##': 2, '♯♯': 2, x: 2, '𝄪': 2, b: -1, '♭': -1, bb: -2, '♭♭': -2, '𝄫': -2, '♮': 0,
};

const cache = new Map<string, Key>();

/**
 * Reads `ctx.music.key`: a tonic and a mode, like `F major`, `Eb`, `F# minor`, `Dm` or `C dorian`.
 * Throws on anything else, since the key comes from the app, not the user.
 */
export function keyOf(text: string): Key {
  const cached = cache.get(text);
  if (cached) return cached;
  const match = KEY.exec(normalize(text).trim());
  const mode = match && (match[3] ? 'minor' : MODE_WORDS[(match[4] ?? '').toLowerCase()] ?? (match[4] ?? '').toLowerCase());
  const steps = mode === null ? undefined : MODES[mode];
  if (!match || !steps) {
    throw new Error(
      `@quantojs/music: ctx.music.key "${text}" isn't a key. Pass a tonic and a mode, like "F major", "Eb", "F# minor", "Dm" or "C dorian"; the modes are ${Object.keys(MODES).join(', ')}.`,
    );
  }
  const tonic = match[1]!.toUpperCase() as Letter;
  const tonicPitch = LETTER_PITCH[tonic] + (match[2] ? ACCIDENTAL_SYMBOLS[match[2]]! : 0);
  const at = LETTERS.indexOf(tonic);
  const notes = new Map<number, Spelling>();
  const degree = (i: number, raise = 0): Spelling => {
    const letter = LETTERS[(at + i) % 7]!;
    const pitch = mod12(tonicPitch + steps[i]! + raise);
    return { letter, accidental: mod12(pitch - LETTER_PITCH[letter] + 6) - 6 };
  };
  let sum = 0;
  for (let i = 0; i < 7; i++) {
    const spelling = degree(i);
    if (Math.abs(spelling.accidental) > 2) {
      throw new Error(`@quantojs/music: ctx.music.key "${text}" needs triple sharps or flats. Use its enharmonic key.`);
    }
    notes.set(mod12(LETTER_PITCH[spelling.letter] + spelling.accidental), spelling);
    sum += spelling.accidental;
  }
  // Minor keys raise the sixth and seventh (melodic and harmonic minor): C♯ in D minor, not D♭.
  if (mode === 'minor' || mode === 'aeolian') {
    for (const i of [5, 6]) {
      const raised = degree(i, 1);
      const pitch = mod12(LETTER_PITCH[raised.letter] + raised.accidental);
      if (!notes.has(pitch)) notes.set(pitch, raised);
    }
  }
  const key = { notes, flats: sum < 0 };
  cache.set(text, key);
  return key;
}

const NATURALS = new Map(LETTERS.map((letter) => [LETTER_PITCH[letter], letter]));

/** How to write a pitch class: as the key has it, or as a natural, or with a sharp (a flat in a flat key). */
export function spell(pitch: number, key: Key | undefined): Spelling {
  const pc = mod12(pitch);
  const inKey = key?.notes.get(pc);
  if (inKey) return inKey;
  const natural = NATURALS.get(pc);
  if (natural) return { letter: natural, accidental: 0 };
  return key?.flats ? { letter: NATURALS.get(mod12(pc + 1))!, accidental: -1 } : { letter: NATURALS.get(mod12(pc - 1))!, accidental: 1 };
}

/** Languages that call B `H` and B♭ `B`, and name accidentals with `-is` and `-es` (`Fis`, `Es`). */
export const H_LANGUAGES: ReadonlySet<string> = new Set(['de', 'da', 'nb', 'nn', 'no', 'sv', 'fi', 'et', 'pl', 'cs', 'sk', 'hu', 'sl', 'hr', 'sr']);

/** Languages that name notes in solfège, and how each writes the seven syllables. */
const SOLFEGE: Readonly<Record<string, readonly string[]>> = {
  fr: ['Do', 'Ré', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
  it: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
  es: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
  ca: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
  ro: ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'],
  pt: ['Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá', 'Si'],
};

const GLYPHS: Readonly<Record<number, string>> = { [-2]: '𝄫', [-1]: '♭', 0: '', 1: '♯', 2: '𝄪' };

/** A spelling's name in the language's convention: `B♭`, German `B` and `Fis`, French `Si♭`. */
export function nameOf({ letter, accidental }: Spelling, language: string): string {
  const solfege = SOLFEGE[language];
  if (solfege) return `${solfege[LETTERS.indexOf(letter)]}${GLYPHS[accidental]}`;
  if (!H_LANGUAGES.has(language)) return `${letter}${GLYPHS[accidental]}`;
  if (letter === 'B') return accidental === -1 ? 'B' : `H${accidental < 0 ? 'eses' : accidental > 0 ? 'is'.repeat(accidental) : ''}`;
  if (accidental >= 0) return `${letter}${'is'.repeat(accidental)}`;
  // A and E take a bare `s`: `As`, `Es`, `Ases`, `Eses`.
  const flat = letter === 'A' || letter === 'E' ? 's' : 'es';
  return `${letter}${accidental === -1 ? flat : `${flat}es`}`;
}
