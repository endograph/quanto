# Agent instructions for quanto

These instructions are for agents working on this repository. They are not shipped with the package (the shipped codec authoring guide is `AUTHORING.md`). `DESIGN.md` is the source of truth for the design.

## Packages

- This is a bun workspace. The core, `quanto`, is `packages/quanto`. Dates are a separate package, `@quantojs/datetime` (`packages/datetime`), and so are music, `@quantojs/music` (`packages/music`), and addresses, `@quantojs/libpostal` (`packages/libpostal`), an external codec over libpostal. New first-party codecs go in the core when their behaviour is complete and settled (a unit table, a small parser, or a finished domain like money), and in a dedicated package when they're intentionally incomplete or still evolving, so their parse results are expected to change between releases. The React input is `@quantojs/react` (`packages/react`). The site is `apps/site`. The root is private: shared tooling and the repo docs.
- Separate packages import quanto only by name, through its public API (`quanto`, `quanto/codecs`, `quanto/quantity`, `quanto/testing`), never by relative path into `packages/quanto/src`. If it needs something that isn't public, raise it as an API question.
- `bun run typecheck` and `bun run build` at the root cover every package.

## Tests

- Never add unit tests unless the user explicitly asks for them, or a test is required to fix a bug.
- Fixtures are the exception. Codec fixture files (`fixtures.json`) are a special kind of unit test: they are the codec's spec. Every built-in codec requires one, and it should be extensive, covering the common inputs, locales, compound forms, every issue code the codec can produce, alternatives, parse context and formatting. Don't write tests of plumbing (that a factory returns a codec, that options are wired). Write the fixtures first, then the parser, as `DESIGN.md` describes.
- Run `bun run check` (typecheck and tests) before calling work done.
