const NAME = 'QuantoInvalidValueError';

/**
 * Thrown by `format` when a value fails the codec's structural check. `formatWithFallback` catches
 * exactly this error; anything else a formatter throws is a bug and propagates.
 */
export class InvalidValueError extends Error {
  override readonly name: string = NAME;
  readonly codec: string;
  readonly problems: readonly { readonly message: string; readonly path?: readonly PropertyKey[] | undefined }[];

  constructor(codec: string, problems: InvalidValueError['problems']) {
    const detail = problems.map((p) => (p.path?.length ? `${p.path.map(String).join('.')}: ${p.message}` : p.message)).join('; ');
    super(`quanto: codec "${codec}" can't format a malformed value (${detail}). Validate stored values with codec.schema, or display them with formatWithFallback.`);
    this.codec = codec;
    this.problems = problems;
  }
}

/** Checks by name rather than `instanceof`, so it holds across duplicate copies of quanto. */
export const isInvalidValueError = (error: unknown): error is InvalidValueError =>
  error instanceof Error && error.name === NAME;
