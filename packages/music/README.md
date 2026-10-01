# @quantojs/music

Music for [quanto](https://github.com/endograph/quanto/blob/main/packages/quanto/README.md): `A4`, `B♭3`, `A4 +15¢`, `Fis4`, `Sol4` and `440 Hz` parse into pitches, and `6/8`, `3+2+2/8` and `common time` into time signatures.

```ts
import { pitch, timeSignature } from '@quantojs/music';

pitch().parse('B♭3');                                   // { value: 58, unit: 'note' } (MIDI)
pitch({ canonicalUnit: 'Hz' }).parse('A4 +15¢');         // { value: 443.83, unit: 'Hz' }
pitch().parse('B4', { locale: 'de-DE' });                // { value: 70, unit: 'note' }: B♭ in German
pitch().format({ value: 70, unit: 'note' });             // 'A♯4'
pitch().format({ value: 70, unit: 'note' }, { music: { key: 'F major' } });   // 'B♭4'
timeSignature().parse('3+2+2/8');                        // { numerator: 7, denominator: 8, groups: [3, 2, 2] }
```

- **`pitch()`** is a quantity in MIDI note numbers (`note`, with cents as the fraction) or `Hz`, so `convert` and `compare` from `quanto/quantity` work on it. Options: `a4` (tuning, default 440), `middleC` (4, or 3 for the Yamaha and French numbering), `defaultOctave`, `defaultUnit` and `canonicalUnit`.
- **Names follow the locale.** German and Nordic `H`/`B` and `-is`/`-es` names, and solfège (`Do Ré Mi`), which reads everywhere. `format` prints the locale's names.
- **`ctx.music.key`** spells notes the way the key does (`F major` prints B♭, `F# major` prints E♯), with sharps by default. Set it once on the provider or per call; it only changes formatting.
- **`timeSignature()`**: `4/4`, `6/8`, additive meters, `C`, `cut time`, `alla breve`, `𝄴`, `𝄵`.
- **Still evolving.** Parse results may change between releases as the grammar grows. The full rules are in the repository's [`DESIGN.md`](https://github.com/endograph/quanto/blob/main/DESIGN.md#music).

`quanto` is a peer dependency.
