import type { ResolvedCtx } from 'quanto';
import { keyOf, type Key } from './spelling';

/** `ctx.music`: settings shared by every music field, set once for the app or a provider. */
export interface MusicCtx {
  /**
   * The key the notes belong to, which decides how `format` spells them: `F major` prints B♭ where
   * the default prints A♯. A tonic and a mode: `F major`, `Eb`, `F# minor`, `Dm`, `C dorian`. Parsing
   * ignores it; a note is the pitch it names, whatever the key.
   */
  readonly key?: string | undefined;
}

declare module 'quanto' {
  interface CtxExtensions {
    /** Settings for `@quantojs/music` codecs. */
    readonly music?: MusicCtx | undefined;
  }
}

/** The key in `ctx.music`, if any. Throws on a malformed one: it's the app's, not the user's. */
export const ctxKey = (ctx: ResolvedCtx): Key | undefined => (ctx.music?.key === undefined ? undefined : keyOf(ctx.music.key));
