# @quanto/units

More units for [quanto](../quanto/README.md): `dataSize`, `dataRate`, `energy`, `power`, `pressure`, `angle`, `frequency`, `fuelEconomy` and `pace`.

```ts
import { dataSize, pace } from '@quanto/units';

dataSize().parse('1.5 GB');   // { ok: true, value: { value: 1.5, unit: 'GB' }, … }
pace().parse('5:30 /km');     // { ok: true, value: { value: 330, unit: 'sPerKm' }, … }
```

`quanto` is a peer dependency. These codecs are built only on quanto's public API, the same one custom codecs use, and follow the same rules: read quanto's README ("Using quanto") for how to store values, and `AUTHORING.md` for how codecs are written.
