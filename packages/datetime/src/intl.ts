import type { ResolvedCtx } from 'quanto';

// Opt-in Intl formatters for dates and times. Display-only: Intl's output varies between ICU versions and
// isn't guaranteed to parse back, so a field using one shows raw text for editing (`display="raw"`).

/** A formatter for a codec's `format` option. */
type Formatter = (value: string, ctx: ResolvedCtx) => string;

const cache = new Map<string, Intl.DateTimeFormat>();
const cached = (key: string, make: () => Intl.DateTimeFormat): Intl.DateTimeFormat => {
  let f = cache.get(key);
  if (!f) {
    f = make();
    cache.set(key, f);
  }
  return f;
};

type DateStyle = 'full' | 'long' | 'medium' | 'short';

/** A UTC Date holding a wall-clock date and time, for formatting with `timeZone: 'UTC'`. */
function wallClock(y: number, m: number, d: number, h = 0, mi = 0, s = 0): Date {
  const date = new Date(Date.UTC(2000, m - 1, d, h, mi, s));
  date.setUTCFullYear(y);
  return date;
}

/** Dates (`2026-10-02`) in Intl's styles: `Friday, October 2, 2026`, `02/10/2026`. Display-only. */
export function intlDate(options?: { readonly dateStyle?: DateStyle }): Formatter {
  const dateStyle = options?.dateStyle ?? 'medium';
  return (value, ctx) => {
    const [y, m, d] = value.split('-').map(Number) as [number, number, number];
    return cached(`d|${ctx.locale.tag}|${dateStyle}`, () => new Intl.DateTimeFormat(ctx.locale.tag, { dateStyle, timeZone: 'UTC' })).format(wallClock(y, m, d));
  };
}

/** Times (`15:00:00`) in Intl's styles: `3:00 PM`, `15:00`. Display-only. */
export function intlTime(options?: { readonly timeStyle?: DateStyle }): Formatter {
  const timeStyle = options?.timeStyle ?? 'short';
  return (value, ctx) => {
    const [h, mi, s] = value.split(':').map(Number) as [number, number, number];
    return cached(`t|${ctx.locale.tag}|${timeStyle}`, () => new Intl.DateTimeFormat(ctx.locale.tag, { timeStyle, timeZone: 'UTC' })).format(wallClock(2000, 1, 1, h, mi, s));
  };
}

/**
 * Local date-times and date-times in Intl's styles: `Oct 2, 2026, 3:00 PM`. Shows the wall-clock time as
 * entered; a date-time's offset isn't shown. Display-only.
 */
export function intlDateTime(options?: { readonly dateStyle?: DateStyle; readonly timeStyle?: DateStyle }): Formatter {
  const dateStyle = options?.dateStyle ?? 'medium';
  const timeStyle = options?.timeStyle ?? 'short';
  return (value, ctx) => {
    const [y, m, d, h, mi, s] = value.slice(0, 19).split(/[-T:]/).map(Number) as [number, number, number, number, number, number];
    return cached(`dt|${ctx.locale.tag}|${dateStyle}|${timeStyle}`, () => new Intl.DateTimeFormat(ctx.locale.tag, { dateStyle, timeStyle, timeZone: 'UTC' })).format(
      wallClock(y, m, d, h, mi, s),
    );
  };
}
