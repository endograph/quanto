import { mergeContexts, startSession } from '../core/context';
import { assertNotExternal } from '../core/define-external-codec';
import { InvalidValueError } from '../core/errors';
import type { StandardSchemaV1 } from '../core/standard-schema';
import type { Codec, Ctx, Issue, ParseContext, ParseResult } from '../core/types';

/** A merged value, tagged with the id of the codec that produced it. */
export interface Tagged<T> {
  readonly codec: string;
  readonly value: T;
}

/** A codec made by `merge()`. `codecs` are its leaf codecs, in order; nested merges are flattened. */
export interface MergedCodec<T> extends Codec<Tagged<T>> {
  readonly codecs: readonly Codec<unknown>[];
}

/** The leaf value type of a codec: a merged codec contributes its members' values, not its tags. */
export type LeafValue<C> = C extends MergedCodec<infer T> ? T : C extends Codec<infer T> ? T : never;

const isMerged = (codec: Codec<unknown>): codec is MergedCodec<unknown> => Array.isArray((codec as Partial<MergedCodec<unknown>>).codecs);

/**
 * Accepts any of several codecs. Earlier codecs win; every other reading (later codecs that also parse,
 * and each member's own alternatives) is reported in `alternatives`, in codec order. The value is tagged
 * by codec id: `{ codec: 'length', value: … }`.
 */
export function merge<const Cs extends readonly Codec<unknown>[]>(codecs: Cs): MergedCodec<LeafValue<Cs[number]>> {
  type T = LeafValue<Cs[number]>;
  for (const c of codecs) assertNotExternal(c, 'merge');
  const members: Codec<unknown>[] = codecs.flatMap((c) => (isMerged(c) ? [...c.codecs] : [c as Codec<unknown>]));
  if (members.length === 0) throw new Error('quanto: merge() needs at least one codec.');
  const ids = new Set<string>();
  for (const m of members) {
    if (ids.has(m.id)) throw new Error(`quanto: merge() got two codecs with the id "${m.id}". Ids tag merged values, so they must be unique.`);
    ids.add(m.id);
  }
  const byId = new Map(members.map((m) => [m.id, m]));
  const id = `merge(${members.map((m) => m.id).join(',')})`;

  const parse = (text: string, ctx?: Ctx): ParseResult<Tagged<T>> => {
    if (text.trim() === '') return { ok: false, issues: [{ code: 'empty', message: 'Enter a value.' }] };
    startSession(ctx);
    const successes: Array<{ value: Tagged<T>; context: ParseContext }> = [];
    const issues: Issue[] = [];
    // Every reading of the text, tagged, in codec order: each member's value, then its own alternatives.
    const readings: Tagged<T>[] = [];
    // Every member sees the same clock: once one reads it, later members get that reading as ctx.now.
    let pinned: Ctx | undefined = ctx;
    for (const m of members) {
      const result = m.parse(text, pinned);
      if (pinned?.now === undefined && result.ok && result.context.now !== undefined) pinned = { ...ctx, now: result.context.now };
      const tag = (value: unknown): Tagged<T> => ({ codec: m.id, value: value as T });
      if (result.ok) {
        const value = tag(result.value);
        successes.push({ value, context: result.context });
        readings.push(value);
      } else issues.push(...result.issues.map((issue) => ({ ...issue, codec: m.id })));
      readings.push(...(result.alternatives ?? []).map(tag));
    }
    const first = successes[0];
    if (!first) return readings.length > 0 ? { ok: false, issues, alternatives: readings } : { ok: false, issues };
    const context = mergeContexts(successes.map((s) => s.context));
    const alternatives = readings.filter((reading) => reading !== first.value);
    return alternatives.length > 0 ? { ok: true, value: first.value, context, alternatives } : { ok: true, value: first.value, context };
  };

  const memberOf = (value: unknown): Codec<unknown> | undefined => {
    if (typeof value !== 'object' || value === null) return undefined;
    const tag = (value as { codec?: unknown }).codec;
    return typeof tag === 'string' ? byId.get(tag) : undefined;
  };

  const format = (value: Tagged<T>, ctx?: Ctx): string => {
    const member = memberOf(value);
    if (!member) throw new InvalidValueError(id, [{ message: `Expected a value tagged with one of: ${[...ids].join(', ')}.`, path: ['codec'] }]);
    return member.format(value.value, ctx);
  };

  const schema: StandardSchemaV1<Tagged<T>, Tagged<T>> = {
    '~standard': {
      version: 1,
      vendor: 'quanto',
      validate(value: unknown): StandardSchemaV1.Result<Tagged<T>> {
        const member = memberOf(value);
        if (!member) {
          return { issues: [{ message: `Expected a value tagged with one of: ${[...ids].join(', ')}.`, path: ['codec'], code: 'invalid' } as Issue] };
        }
        const inner = member.schema['~standard'].validate((value as Tagged<unknown>).value);
        if (inner instanceof Promise) throw new Error(`quanto: the schema of codec "${member.id}" is async. quanto supports only synchronous schemas.`);
        if (inner.issues) return { issues: inner.issues.map((issue) => ({ ...issue, path: ['value', ...(issue.path ?? [])] })) };
        return { value: { codec: member.id, value: inner.value as T } };
      },
    },
  };

  return { id, parse, format, schema, codecs: members };
}
