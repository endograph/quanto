import { startSession } from './context';
import { codecParts, EMPTY, type CodecDefinition } from './define-codec';
import type { Completion, Ctx, ExternalCodec, ExternalParseOutcome, ExternalParseResult, Issue, ResolvedCtx } from './types';

/** What an external codec's author supplies: a `CodecDefinition` whose `parse` is async, and optionally `complete`. */
export interface ExternalCodecDefinition<T> extends Omit<CodecDefinition<T>, 'parse'> {
  /**
   * Receives trimmed, non-empty text and calls the service, passing it `ctx.signal`. Resolve with
   * issues for bad input; reject when the service can't answer. With an `ambiguous` issue, return the
   * candidates as `alternatives` (known values) or `completions` (which may need a fetch). A service
   * that only completes can use `parseFromCompletions`.
   */
  parse(text: string, ctx: ResolvedCtx): Promise<ExternalParseOutcome<T>>;
  /**
   * Candidate values for trimmed, non-empty text that may not be finished. Optional. Pass `ctx.signal`
   * and `ctx.session` to the service. Resolve with `[]` when there are none; reject when the service
   * can't answer.
   */
  complete?(text: string, ctx: ResolvedCtx): Promise<readonly Completion<T>[]>;
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
  const { finish, accept, format, schema } = codecParts(definition);

  /**
   * Completions as the author returned them, checked like values: a known value goes through the check
   * and the schema (dropped if the schema rejects it), and a lazy one's `resolve` is checked when it
   * settles and honours `ctx.signal`. The schema runs on a resolved value when it's picked.
   */
  const completionsOf = (text: string, completions: readonly Completion<T>[] | undefined): readonly Completion<T>[] =>
    (completions ?? []).flatMap((completion): Completion<T>[] => {
      const identity = completion.id === undefined ? { label: completion.label } : { label: completion.label, id: completion.id };
      if ('value' in completion) {
        const value = accept(text, completion.value);
        return value === undefined ? [] : [{ ...identity, value }];
      }
      const resolve = async (ctx?: Ctx): Promise<T> => {
        throwIfAborted(ctx);
        const value = await untilAborted(() => completion.resolve(ctx), ctx);
        throwIfAborted(ctx);
        const problems = definition.check(value);
        if (problems.length > 0) {
          throw new Error(
            `quanto: codec "${definition.id}" resolved the completion ${JSON.stringify(completion.label)} into a value its own check rejects (${problems[0]!.message}). This is a bug in the codec's complete or check.`,
          );
        }
        return value;
      };
      return [{ ...identity, resolve }];
    });

  const parse = async (text: string, ctx?: Ctx): Promise<ExternalParseResult<T>> => {
    throwIfAborted(ctx);
    const trimmed = text.trim();
    if (trimmed === '') return EMPTY;
    const session = startSession(ctx);
    const outcome = await untilAborted(() => definition.parse(trimmed, session.ctx), ctx);
    throwIfAborted(ctx);
    const result = finish(trimmed, outcome, session);
    const completions = completionsOf(trimmed, outcome.completions);
    return completions.length > 0 ? { ...result, completions } : result;
  };

  const author = definition.complete;
  const complete = author
    ? async (text: string, ctx?: Ctx): Promise<readonly Completion<T>[]> => {
        throwIfAborted(ctx);
        const trimmed = text.trim();
        if (trimmed === '') return [];
        const session = startSession(ctx);
        const completions = await untilAborted(() => author(trimmed, session.ctx), ctx);
        throwIfAborted(ctx);
        return completionsOf(trimmed, completions);
      }
    : undefined;

  return complete ? { external: true, id: definition.id, parse, complete, format, schema } : { external: true, id: definition.id, parse, format, schema };
}

/** Options for `parseFromCompletions`. */
export interface ParseFromCompletionsOptions<T> {
  /**
   * Picks the completion that is the value, or undefined to not choose. Default: the only completion,
   * when there's exactly one. Never "the first": completion services read text as a prefix, so
   * `12 Main St` completes to `120 Main St`.
   */
  readonly accept?: ((completions: readonly Completion<T>[], text: string) => Completion<T> | undefined) | undefined;
}

/** The `Ctx` to pass on to a completion's `resolve` from inside a parse. */
const ctxOf = (ctx: ResolvedCtx): Ctx => ({
  locale: ctx.locale.tag,
  ...(ctx.signal ? { signal: ctx.signal } : {}),
  ...(ctx.session !== undefined ? { session: ctx.session } : {}),
});

/**
 * Builds an external codec's `parse` from a `complete` function, for services that only complete. The
 * parse chooses with `accept`: a chosen completion (resolved if it needs a fetch) is the value. With
 * nothing to choose from, it's `unparseable`; with several and no choice, it's `ambiguous`, carrying
 * them as `completions`, so the field offers them.
 */
export function parseFromCompletions<T>(
  complete: (text: string, ctx: ResolvedCtx) => Promise<readonly Completion<T>[]>,
  options?: ParseFromCompletionsOptions<T>,
): (text: string, ctx: ResolvedCtx) => Promise<ExternalParseOutcome<T>> {
  const choose = options?.accept ?? ((completions) => (completions.length === 1 ? completions[0] : undefined));
  return async (text, ctx) => {
    const completions = await complete(text, ctx);
    const chosen = choose(completions, text);
    if (chosen) return { ok: true, value: 'value' in chosen ? chosen.value : await chosen.resolve(ctxOf(ctx)) };
    if (completions.length === 0) return { ok: false, issues: [{ code: 'unparseable', message: `Couldn't find a match for "${text}".` }] };
    const ambiguous: Issue = { code: 'ambiguous', message: `"${text}" matches several. Choose one.` };
    return { ok: false, issues: [ambiguous], completions };
  };
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
