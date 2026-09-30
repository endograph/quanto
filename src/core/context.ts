import { resolveLocale } from '../locale';
import type { Ctx, ParseContext, ResolvedCtx } from './types';

const DEFAULT_LOCALE = 'en-US';

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

const pad = (n: number, width = 2): string => String(Math.abs(n)).padStart(width, '0');

/** The machine's clock and local offset, as an RFC 3339 string with whole seconds. */
export function machineNow(): string {
  const d = new Date();
  const offset = -d.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  return (
    `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
  );
}

export interface Session {
  readonly ctx: ResolvedCtx;
  /** The context the session was based on so far. */
  context(): ParseContext;
}

/**
 * Resolves a `Ctx` for one parse or format call, tracking whether the clock was read. Throws on a
 * malformed `ctx`, which is a programmer error, not bad input.
 */
export function startSession(ctx: Ctx | undefined): Session {
  const locale = resolveLocale(ctx?.locale ?? DEFAULT_LOCALE);
  if (ctx?.now !== undefined && !RFC3339.test(ctx.now)) {
    throw new Error(
      `quanto: ctx.now "${ctx.now}" is not an RFC 3339 timestamp with a UTC offset. Pass a string like "2026-09-30T14:02:11-04:00", or omit it to use the machine's clock.`,
    );
  }
  let now: string | undefined;
  return {
    ctx: {
      locale,
      now() {
        now ??= ctx?.now ?? machineNow();
        return now;
      },
    },
    context: () => (now === undefined ? { locale: locale.tag } : { locale: locale.tag, now }),
  };
}

/** Combines the contexts of several parses of the same input: the locale, and the first `now` read. */
export function mergeContexts(contexts: readonly ParseContext[]): ParseContext {
  const locale = contexts[0]?.locale ?? DEFAULT_LOCALE;
  const now = contexts.find((c) => c.now !== undefined)?.now;
  return now === undefined ? { locale } : { locale, now };
}
