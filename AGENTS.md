# Agent instructions for quanto

These instructions are for agents working on this repository. They are not shipped with the package (the shipped codec authoring guide is `AUTHORING.md`). `DESIGN.md` is the source of truth for the design.

## Tests

- Never add unit tests unless the user explicitly asks for them, or a test is required to fix a bug.
- Fixtures are the exception. Codec fixture files (`fixtures.json`) are a special kind of unit test: they are the codec's spec. Every built-in codec requires one, and it should be extensive, covering the common inputs, locales, compound forms, every issue code the codec can produce, alternatives, parse context and formatting. Don't write tests of plumbing (that a factory returns a codec, that options are wired). Write the fixtures first, then the parser, as `DESIGN.md` describes.
- Never run unit tests, fixtures included. A CI agent runs them; that is not the implementing agent's concern.
- Running `bun run typecheck` and `bun run build` is fine.
