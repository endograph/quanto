# @quantojs/sizes

Ring and shoe sizes for [quanto](https://github.com/endograph/quanto/blob/main/packages/quanto/README.md): `US 7`, `N½`, `EU 54` and `17.3 mm diameter` parse into ring sizes, and `US M 10`, `W 8`, `UK 9`, `EU 44` and `27 cm` into shoe sizes, which convert between systems.

```ts
import { ringSize, shoeSize, nearestSize } from '@quantojs/sizes';
import { convert } from 'quanto/quantity';

ringSize().parse('US 7½');                              // { value: 7.5, unit: 'us' }
ringSize().parse('N½');                                 // { value: 14.5, unit: 'uk' }: letters are UK sizes
ringSize({ canonicalUnit: 'eu' }).parse('US 7');        // { value: 54.42, unit: 'eu' }: the circumference in mm
ringSize().format({ value: 14.5, unit: 'uk' });         // 'UK N½'
shoeSize().parse("men's 10");                           // { value: 10, unit: 'usMen' }
shoeSize().parse('US 10');                              // ambiguous: men's or women's
shoeSize({ fit: 'womens' }).parse('US 8');              // { value: 8, unit: 'usWomen' }
const eu = convert(shoeSize(), { value: 10, unit: 'usMen' }, 'eu');   // { value: 42.64, unit: 'eu' }
nearestSize(shoeSize(), { value: 10, unit: 'usMen' }, 'eu');          // { value: 42.5, unit: 'eu' }
```

- **Sizes are quantities.** Each system is a unit over a physical base, the ring's inner circumference or the foot's length, so `convert` and `compare` from `quanto/quantity` work. `nearestSize` rounds a conversion to the target system's standard steps (quarter sizes for US rings, half sizes for US and UK shoes).
- **`ringSize()`**: `us` (US and Canada, with quarter sizes), `uk` (UK, Ireland, Australia and New Zealand: letters with halves, and `Z+1` on), `eu` (ISO 8653: the circumference in mm), `ch` (Switzerland, Italy and Spain: the circumference less 40) and `diameter` in mm. These are defined exactly, so they convert exactly. `54 mm` is the circumference, as ISO 8653 has it, with the diameter as an alternative. Japanese sizes aren't included: they have no defining formula.
- **`shoeSize()`**: adult sizes in `usMen`, `usWomen`, `uk`, `eu` (Paris points), `mm` (Mondopoint) and `cm` (Japan). A US size needs its fit, written (`men's 10`, `US W 8`) or from the `fit` option; otherwise it's `ambiguous`, with both readings. Kids' sizes (`5C`, `3Y`) and widths (`10 D`) are `unknown_unit`.
- **Shoe conversions follow the formulas, not a retail chart.** Each system is defined on the shoe's last, and the step to the foot uses the common allowance of two sizes, so US men's 10 is UK 9 and EU 42.6. Retail charts differ from each other and usually put EU a size higher. The formulas are the default because they're defined, not chosen from one brand; to show a retailer's chart, pass your own `format`.
- **Bare numbers** (`7`, `size 10`) need a `defaultUnit`, which can follow the locale: `{ us: 'usMen', uk: 'uk', metric: 'eu' }`. The system is never guessed from the number.
- **Still evolving.** More categories may come, and the chart-dependent conversions may be refined between releases, so parse and conversion results can change.

`quanto` is a peer dependency.
