# @quantojs/anything

One [quanto](https://github.com/endograph/quanto/blob/main/packages/quanto/README.md) codec that reads anything the first-party packages can: dates, times, money, every quantity, dimensions, coordinates, ring and shoe sizes, CSS colors, pitches, numbers, ratios and odds, ranges of them, and all of it approximate. It's the big field on quanto's site, as a package.

```ts
import { anything } from '@quantojs/anything';
import { phoneNumber } from '@quantojs/anything/phone';

anything().parse('24x36in');      // { value: { codec: 'dimensions(length)', value: [{ value: 24, unit: 'in' }, …] }, approximate: false }
anything().parse('about 6 ft');   // { value: { codec: 'length', value: { value: 6, unit: 'ft' } }, approximate: true }
anything().parse('$10-20k');      // { value: { codec: 'range(money)', value: { start: …, end: … } }, approximate: false }
anything().parse('next fri');     // { value: { codec: 'date', value: '2026-10-02' }, approximate: false }

const withPhones = anything({ include: [phoneNumber()] });
withPhones.parse('(415) 555-2671');   // { value: { codec: 'phoneNumber', value: '+14155552671' }, approximate: false }
```

- **The value is tagged** with the id of the codec that read it: switch on `value.codec` to know what `value.value` is. `format` prints it with that codec.
- **The order settles conflicts.** The first codec that reads the text wins, and the others' readings are its alternatives. Dates and times come first, then dimensions, length, mass, duration and temperature, money, pitch, the other quantities, coordinates, sizes and CSS colors, then plain numbers, ratios and odds, then ranges. So `24 × 36 in` is dimensions, `455hz` a pitch, `3 g` grams, `11/4` a date, `25 bps` a data rate, `US 10` a ring size, `2700 K` a temperature (with the color temperature as an alternative) and `70` a number. CSS colors read without `bare`, so `bad` and `0 170 255` aren't colors. A trailing `odds` claims any of them for odds: `11/4 odds`, `70 odds`. The fixtures pin every conflict.
- **Phone numbers are opt-in** with `include`, since libphonenumber-js's metadata is about 80 kB. `phoneNumber` is re-exported from `@quantojs/anything/phone` for convenience, on its own subpath so the main entry never brings the metadata, whatever the bundler. To load it later, `await import('@quantojs/anything/phone')` and build the codec again with it.
- **`include`** takes any codecs: they're read after the built-in ones and before the catch-alls (numbers, ratios, odds).
- **`names`** adds month and weekday names for dates, as `date({ names })` does.
- **Failures are tidied:** the first issue of each informative code (`unknown_unit`, `ambiguous`, …), or one `unparseable`.
- Not included: addresses (an external codec), `percent` (`proportion` reads `%`), `text` and time signatures (`6/8` is a date).
- **Still evolving.** The order changes as codecs are added, so what a text reads as can change between releases.

`quanto` is a peer dependency.
