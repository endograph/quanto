# Agent instructions for quanto

These instructions are for agents working on this repository. They are not shipped with the package (the shipped codec authoring guide is `AUTHORING.md`). `DESIGN.md` is the source of truth for the design.

## Packages

- This is a bun workspace. The core, `quanto`, is `packages/quanto`; `@quanto/codecs` is `packages/codecs`. The root is private: shared tooling and the repo docs.
- `@quanto/codecs` imports quanto only by name, through its public API (`quanto`, `quanto/codecs`, `quanto/quantity`, `quanto/testing`), never by relative path into `packages/quanto/src`. If it needs something that isn't public, raise it as an API question.
- `bun run typecheck` and `bun run build` at the root cover every package.

## Tests

- Never add unit tests unless the user explicitly asks for them, or a test is required to fix a bug.
- Fixtures are the exception. Codec fixture files (`fixtures.json`) are a special kind of unit test: they are the codec's spec. Every built-in codec requires one, and it should be extensive, covering the common inputs, locales, compound forms, every issue code the codec can produce, alternatives, parse context and formatting. Don't write tests of plumbing (that a factory returns a codec, that options are wired). Write the fixtures first, then the parser, as `DESIGN.md` describes.
- Never run unit tests, fixtures included. A CI agent runs them; that is not the implementing agent's concern.
- Running `bun run typecheck` and `bun run build` is fine.
