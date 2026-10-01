/**
 * Month and weekday names for one language. English is built in; other languages are passed to a codec
 * with its `names` option: `date({ names: [de] })`. The six in `@quantojs/datetime/names` are generated
 * from ICU; any other language is just a `Names` object.
 */
export interface Names {
  /** The language subtag (`de`). `format` uses these names when it matches `ctx.locale`'s language. */
  readonly language: string;
  /**
   * Twelve entries, January first. Each lists accepted forms: the full name first, then the abbreviation
   * `format` prints, then any other forms (`['September', 'Sep', 'Sept']`). Matched case- and
   * accent-insensitively, with or without a trailing period.
   */
  readonly months: readonly (readonly string[])[];
  /** Seven entries, Monday first, listing accepted forms (`['Dienstag', 'Di']`). */
  readonly weekdays: readonly (readonly string[])[];
  /** Words skipped between a date's parts: Spanish `de` in `2 de octubre de 2026`. */
  readonly fillers?: readonly string[] | undefined;
}

/** English names: built in, accepted in every locale. */
export const en: Names = {
  language: 'en',
  months: [
    ['January', 'Jan'], ['February', 'Feb'], ['March', 'Mar'], ['April', 'Apr'], ['May'], ['June', 'Jun'],
    ['July', 'Jul'], ['August', 'Aug'], ['September', 'Sep', 'Sept'], ['October', 'Oct'], ['November', 'Nov'], ['December', 'Dec'],
  ],
  weekdays: [
    ['Monday', 'Mon'], ['Tuesday', 'Tue', 'Tues'], ['Wednesday', 'Wed', 'Weds'], ['Thursday', 'Thu', 'Thur', 'Thurs'],
    ['Friday', 'Fri'], ['Saturday', 'Sat'], ['Sunday', 'Sun'],
  ],
};

/** The abbreviation `format` prints for a month (1–12): the second form, or the only one. */
export const monthAbbreviation = (names: Names, month: number): string => {
  const forms = names.months[month - 1]!;
  return forms[1] ?? forms[0]!;
};

/** Validates a name set when a codec is created: twelve months, seven weekdays, no empty forms. */
export function assertNames(names: Names): void {
  const where = `quanto: names for "${names.language}"`;
  if (names.months.length !== 12 || names.weekdays.length !== 7) throw new Error(`${where} need 12 months and 7 weekdays.`);
  if ([...names.months, ...names.weekdays].some((forms) => forms.length === 0 || forms.some((f) => f.trim() === ''))) {
    throw new Error(`${where} have an empty entry. Every month and weekday needs at least one non-empty form.`);
  }
}
