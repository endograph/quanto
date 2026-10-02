# @quantojs/common

The common codecs for [quanto](https://github.com/endograph/quanto/blob/main/packages/quanto/README.md): lengths, weights, durations, temperatures and thirty more quantities, plain numbers, percents, proportions, ratios, text, money and betting odds, with ready-made formatters.

```ts
import { length, mass, percent } from '@quantojs/common';
import { money } from '@quantojs/common/money';
import { odds } from '@quantojs/common/odds';
import { feetInches } from '@quantojs/common/formats';

length().parse(`5'11"`);                      // { ok: true, value: { value: 71, unit: 'in' } }
length().parse('1,8 m', { locale: 'de-DE' }); // { ok: true, value: { value: 1.8, unit: 'm' } }
mass().parse('70 kg');                        // { ok: true, value: { value: 70, unit: 'kg' } }
percent().parse('12.5%');                     // { ok: true, value: 12.5 }
money({ defaultCurrency: 'USD' }).parse('$1.2k');
odds().parse('5/2');
length({ format: feetInches }).format({ value: 180, unit: 'cm' }); // `5'11"`
```

- **A bootstrap, not the protocol.** `quanto` holds the contract every codec conforms to; these codecs are built on its public API, exactly as yours would be. Use them as they are, copy one and change it, or write your own: nothing here has a hook a custom codec doesn't.
- **`@quantojs/common`**: the quantity codecs, each with its unit table (`length`/`lengthUnits`, `mass`/`massUnits`, `duration`, `temperature`, `volume`, `area`, `speed`, `dataSize`, `dataRate`, `compute`, `computeRate`, `energy`, `power`, `pressure`, `angle`, `frequency`, `fuelEconomy`, `pace`, `torque`, `force`, `acceleration`, `flowRate`, `density`, `voltage`, `current`, `resistance`, `capacitance`, `charge`, `luminousFlux`, `illuminance`, `luminance`, `radiationDose`, `absorbedDose`, `proportion`, `soundLevel`), and `number`, `percent`, `ratio` and `text`. Convert and compare quantities with `convert` and `compare` from `quanto/quantity`.
- **`@quantojs/common/money`**: `money`, its operations (`add`, `subtract`, `compare`, `scale`, `convert`, `allocate`, `roundWithMode`), `moneyRange` and `intlMoney`.
- **`@quantojs/common/odds`**: `odds` in fractional, decimal and American notation, and its operations.
- **`@quantojs/common/formats`**: `feetInches`, `poundsOunces`, `stonesPounds`, `hoursMinutes` and the display-only `intlUnit`. Build your own compound formatter with `compoundFormatter` from `quanto/formats`.
- **Extend a table** rather than starting over: `quantity({ id: 'horseHeight', units: { ...lengthUnits, hand: { toBase: 0.1016, aliases: ['hh', 'hands'] } } })`, with `quantity` from `quanto`.

Each codec's `fixtures.json` is its spec. The design is in the repository's [`DESIGN.md`](https://github.com/endograph/quanto/blob/main/DESIGN.md).

`quanto` is a peer dependency.
