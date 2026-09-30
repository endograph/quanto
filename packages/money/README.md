# @quanto/money

Money for [quanto](../quanto/README.md): `$12`, `12 USD`, `€12,50`, `12.50 eur`, `$1.2k` and `12 bucks` parse into an integer amount of the currency's minor unit.

```ts
import { money, add, allocate, moneyRange } from '@quanto/money';

money().parse('$12.34');                // { ok: true, value: { minorUnits: 1234, currency: 'USD' }, … }
moneyRange(money()).parse('$10-20k');   // $10k–$20k
allocate({ minorUnits: 1000, currency: 'USD' }, [1, 1, 1]);  // 334, 333, 333
```

- **Values** are `{ minorUnits, currency }`: integers, never floats, with decimal places from a bundled ISO 4217 table.
- **Operations**: `add`, `subtract`, `compare` (same currency only), `scale` and `convert` (with an explicit rounding mode), and `allocate`. quanto never fetches exchange rates.
- **`moneyRange`**: a side borrows the other's currency and magnitude suffix.
- **`intlMoney`**: an opt-in, display-only `Intl` formatter.

`quanto` is a peer dependency. Read quanto's README ("Using quanto") for how to store values.
