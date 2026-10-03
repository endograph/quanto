<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset=".github/assets/mark-dark.svg" />
    <img src=".github/assets/mark-light.svg" alt="quanto" width="72" />
  </picture>
</p>

<p align="center">
  <a href="https://endograph.github.io/quanto/">Website</a> ·
  <a href="https://endograph.github.io/quanto/playground/">Playground</a> ·
  <a href="DESIGN.md">Design</a> ·
  <a href="packages/quanto/README.md">Usage</a> ·
  <a href="packages/quanto/AUTHORING.md">Writing a codec</a> ·
  <a href="packages/common/README.md">Codecs</a> ·
  <a href="packages/datetime/README.md">Dates</a>
</p>

# quanto

A flexible input parser and formatter.

People type `5'11"`, `180cm` and `1,8 m` and mean the same height. quanto turns that into a typed value you can store, compare and format back.

```ts
import { length } from '@quantojs/common';

length().parse(`5'11"`);  // { ok: true, value: { value: 71, unit: 'in' } }
length().parse('1,8 m');  // { ok: true, value: { value: 1.8, unit: 'm' } }
length().parse('70 kg');  // { ok: false, issues: [{ code: 'unknown_unit', … }] }
```

- **Forgiving.** Locale-aware numbers, compound input like `2h30m`, smart quotes, `$1.2k`, `next fri`.
- **Plain data.** Values are JSON. Validate them on the server with any Standard Schema library, no re-parsing.
- **Round-trips.** Whatever `format` prints, `parse` reads back.
- **Yours to extend.** `quanto` is the protocol; the codecs are a bootstrap. Yours use the same API as the first-party ones, and a fixtures file is the spec.

[`@quantojs/common`](packages/common/README.md) has length, mass, duration, temperature, volume, area, speed, data size and rate, compute (FLOPs and FLOPS), energy, power, pressure, angle, frequency, fuel economy, pace, torque, force, acceleration, flow rate, density, electrical (voltage, current, resistance, capacitance, charge), light (lumens, lux, nits, color temperature), radiation dose, sound level, plain numbers, percent, proportions (‰, basis points, ppm) and ratios, with money in `@quantojs/common/money`, betting odds in `@quantojs/common/odds` and CSS colors (hex, names, `rgb()`, `oklch()`, `color()`…) in `@quantojs/common/css-color`. [`@quantojs/datetime`](packages/datetime/README.md) adds dates, times, ranges like `Oct 3-5` and offsets like `2 weeks before`, and separate packages add [phone numbers](packages/libphonenumber/README.md), [coordinates](packages/geo/README.md) (plus codes and geohashes too), [ring and shoe sizes](packages/sizes/README.md), [music](packages/music/README.md) and [addresses](packages/libpostal/README.md). Not sure which one you'll get? `merge` them and take the first that parses, or take [`@quantojs/anything`](packages/anything/README.md), which reads all of it.

Pre-release, not on npm yet.

## Development

```sh
bun install
bun run typecheck
bun run build
bun run test
bun run site        # the website and playground, on localhost:4173
```

It's a bun workspace: the core (the protocol) lives in `packages/quanto`, the common codecs in `packages/common`, dates in `packages/datetime`, and the website in `apps/site`. Tests and the site resolve the packages to source, so nothing needs building first.
