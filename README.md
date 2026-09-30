# quanto

Turn messy human text into well-typed values and back. This repository is a bun workspace:

| Package | Path | What it is |
|---|---|---|
| `quanto` | [`packages/quanto`](packages/quanto/README.md) | The core: `defineCodec`, the primitives, the wrappers, and the everyday codecs (lengths, weights, durations, money, dates…). |
| `@quanto/codecs` | [`packages/codecs`](packages/codecs/README.md) | More codecs, built only on quanto's public API. |

- [`DESIGN.md`](DESIGN.md) is the source of truth for the design.
- [`AGENTS.md`](AGENTS.md) has instructions for agents working in this repository.
- [`packages/quanto/AUTHORING.md`](packages/quanto/AUTHORING.md) is the codec authoring guide, shipped with the package.

## Development

```sh
bun install
bun run typecheck   # every package
bun run build       # every package
bun run test        # every package's fixtures and tests, against source
```

Tests and typechecking resolve `quanto` to `packages/quanto/src`, so nothing needs building first.
