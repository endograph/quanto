<p align="center">
  <img src="favicon.svg" alt="quanto" width="96" />
</p>

<p align="center">
  <a href="DESIGN.md">Design</a> ·
  <a href="packages/quanto/README.md">Usage</a> ·
  <a href="packages/quanto/AUTHORING.md">Writing a codec</a> ·
  <a href="packages/money/README.md">Money</a> ·
  <a href="packages/datetime/README.md">Dates</a> ·
  <a href="packages/codecs/README.md">More codecs</a>
</p>

# quanto

A forgiving and flexible input parser and formatter.

People type `5'11"`, `180cm` and `1,8 m` and mean the same height. quanto turns that into a typed value you can store, compare and format back.

```ts
import { length } from 'quanto/codecs';

length().parse(`5'11"`);  // { ok: true, value: { value: 71, unit: 'in' } }
length().parse('1,8 m');  // { ok: true, value: { value: 1.8, unit: 'm' } }
length().parse('70 kg');  // { ok: false, issues: [{ code: 'unknown_unit', … }] }
```

- **Forgiving.** Locale-aware numbers, compound input like `2h30m`, smart quotes, `$1.2k`, `next fri`.
- **Plain data.** Values are JSON. Validate them on the server with any Standard Schema library, no re-parsing.
- **Round-trips.** Whatever `format` prints, `parse` reads back.
- **Yours to extend.** Custom codecs use the same API as the built-ins, and a fixtures file is the spec.

Built in: length, mass, duration, temperature, volume, area, speed and percent. [`@quanto/money`](packages/money/README.md) adds money, [`@quanto/datetime`](packages/datetime/README.md) dates and times, and [`@quanto/codecs`](packages/codecs/README.md) data sizes, energy, pace, pressure and a few more. Not sure which one you'll get? `merge` them and take the first that parses.

Pre-release, not on npm yet.

## Development

```sh
bun install
bun run typecheck
bun run build
bun run test
bun run site        # the website and playground, on localhost:4173
```

It's a bun workspace: the core lives in `packages/quanto`, the extra codecs in `packages/codecs`, and the website in `apps/site`. Tests resolve `quanto` to source, so nothing needs building first.
