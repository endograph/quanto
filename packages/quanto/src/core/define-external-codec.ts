import { startSession } from './context';
import { codecParts, EMPTY, type CodecDefinition } from './define-codec';
import type { Ctx, ExternalCodec, ParseOutcome, ParseResult, ResolvedCtx } from './types';

/** What an external codec's author supplies: a `CodecDefinition` whose `parse` is async. */
export interface ExternalCodecDefinition<T> extends Omit<CodecDefinition<T>, 'parse'> {
  /**
   * Receives trimmed, non-empty text and calls the service, passing it `ctx.signal`. Resolve with
   * issues for bad input; reject when the service can't answer.
   */
  parse(text: string, ctx: ResolvedCtx): Promise<ParseOutcome<T>>;
}

/** Rejects with the signal's reason once it has aborted. */
function throwIfAborted(ctx: Ctx | undefined): void {
  if (ctx?.signal?.aborted) throw ctx.signal.reason;
}

/** The part of an `AbortSignal` that can report an abort as it happens. */
interface ListenableSignal {
  addEventListener(type: 'abort', listener: () => void, options?: { once?: boolean }): void;
  removeEventListener(type: 'abort', listener: () => void): void;
}

const isListenable = (signal: unknown): signal is ListenableSignal =>
  typeof (signal as Partial<ListenableSignal> | undefined)?.addEventListener === 'function';

/**
 * Starts the service and returns its answer, or rejects with `signal.reason` as soon as the signal
 * aborts, whichever comes first, so an abort settles the parse even if the service ignores the signal.
 * The listener goes on before the service starts, so an abort during its startup isn't missed. Once
 * aborted, the service's error is never the one reported.
 */
async function untilAborted<T>(start: () => Promise<T>, ctx: Ctx | undefined): Promise<T> {
  const signal = isListenable(ctx?.signal) ? ctx.signal : undefined;
  let listener: (() => void) | undefined;
  const aborted = signal
    ? new Promise<never>((_, reject) => {
        listener = () => reject(ctx!.signal!.reason);
        signal.addEventListener('abort', listener, { once: true });
      })
    : undefined;
  let work: Promise<T>;
  try {
    work = start();
  } catch (error) {
    work = Promise.reject(error);
  }
  try {
    return await (aborted ? Promise.race([work, aborted]) : work);
  } catch (error) {
    throwIfAborted(ctx);
    throw error;
  } finally {
    if (listener) signal?.removeEventListener('abort', listener);
    // The service may still settle after an abort; its outcome is no longer wanted.
    work.catch(() => {});
  }
}

/**
 * Defines an external codec: one whose parse happens outside the field (a model, a server, a worker).
 * It does everything `defineCodec` does, around an async `parse`; `format`, `check` and the schema stay
 * sync. Empty input never reaches the service, and an aborted parse rejects with `ctx.signal.reason`,
 * even if the service ignored the signal.
 *
 * An external codec owns its whole parse: `merge`, `range` and `approx` don't take one, so a service
 * that should accept several kinds of value, ranges or approximations does that itself.
 */
export function defineExternalCodec<T>(definition: ExternalCodecDefinition<T>): ExternalCodec<T> {
  const { finish, format, schema } = codecParts(definition);

  const parse = async (text: string, ctx?: Ctx): Promise<ParseResult<T>> => {
    throwIfAborted(ctx);
    const trimmed = text.trim();
    if (trimmed === '') return EMPTY;
    const session = startSession(ctx);
    const outcome = await untilAborted(() => definition.parse(trimmed, session.ctx), ctx);
    throwIfAborted(ctx);
    return finish(trimmed, outcome, session);
  };

  return { external: true, id: definition.id, parse, format, schema };
}

/** Whether a codec is external, for wrappers and consumers that accept either kind. */
export const isExternalCodec = (codec: unknown): codec is ExternalCodec<unknown> =>
  typeof codec === 'object' && codec !== null && (codec as { external?: unknown }).external === true;

/**
 * Throws if `codec` is external. `merge`, `range` and `approx` parse around their inner codec, and an
 * external codec owns its whole parse.
 */
export function assertNotExternal(codec: unknown, wrapper: string): void {
  if (!isExternalCodec(codec)) return;
  throw new Error(
    `quanto: ${wrapper}() got the external codec "${codec.id}". An external codec owns its whole parse, so do the ${wrapper} in its service. Only optional() wraps external codecs.`,
  );
}
