/** Month and weekday names for one language. Months start at January, weekdays at Monday. */
export interface Names {
  readonly language: string;
  readonly months: { readonly long: readonly string[]; readonly short: readonly string[] };
  readonly weekdays: { readonly long: readonly string[]; readonly short: readonly string[] };
}

// Which languages ship names in v1 is an open question (DESIGN.md). English is always bundled,
// and English names are accepted in every locale.
export const NAMES: Readonly<Record<string, Names>> = {
  en: {
    language: 'en',
    months: {
      long: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      short: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
    },
    weekdays: {
      long: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
      short: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    },
  },
};
