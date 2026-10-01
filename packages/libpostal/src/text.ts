// Text helpers: folding names for lookup, and finding libpostal's components in the text as typed.

/** A name folded for lookup: accents and case dropped, `.` removed, other punctuation as spaces. */
export const fold = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();

/**
 * The text's letters and digits, folded like `fold`, with each code unit's span in the original. libpostal
 * lowercases its output and drops some punctuation, so components are matched on this.
 */
function letters(text: string): { readonly folded: string; readonly start: number[]; readonly end: number[] } {
  let folded = '';
  const start: number[] = [];
  const end: number[] = [];
  for (let i = 0; i < text.length; ) {
    const ch = String.fromCodePoint(text.codePointAt(i)!);
    const lower = /[\p{L}\p{N}]/u.test(ch) ? ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase() : '';
    for (let k = 0; k < lower.length; k++) {
      start.push(i);
      end.push(i + ch.length);
    }
    folded += lower;
    i += ch.length;
  }
  return { folded, start, end };
}

/** A component found in the text: the text as typed, and where. */
export interface Located {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * Finds each of `values` in `text`, in order, as typed: `mountain view` in `…, Mountain View, CA` is
 * `Mountain View`. A value not found in the text (libpostal normalized it beyond recognition) is kept as
 * libpostal gave it, at the end.
 */
export function locate(text: string, values: readonly string[]): Located[] {
  const index = letters(text);
  let cursor = 0;
  return values.map((value) => {
    const target = letters(value).folded;
    if (target === '') return { text: value.trim(), start: text.length, end: text.length };
    // Components come in the order they were written; search from the last one, then from the start.
    let at = index.folded.indexOf(target, cursor);
    if (at < 0) at = index.folded.indexOf(target);
    if (at < 0) return { text: value.trim(), start: text.length, end: text.length };
    const start = index.start[at]!;
    const end = index.end[at + target.length - 1]!;
    cursor = at + target.length;
    return { text: text.slice(start, end), start, end };
  });
}

/** Whether only spaces lie between two spans of `text`, so they read as one: `Hauptstraße 5`. */
export const adjacent = (text: string, end: number, start: number): boolean => start >= end && /^\s*$/.test(text.slice(end, start));
