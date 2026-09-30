# quanto

Turn messy human text into well-typed values and back: `5'11"`, `180cm` and `1,8 m` all parse into the same typed length, which can be converted, compared and formatted. The same idea covers weights, durations, money, dates and custom types, with no inference at runtime.

Pre-release. See [DESIGN.md](./DESIGN.md) for the design and open questions.

## Development

```sh
bun install
bun run test
bun run typecheck
bun run build
```
