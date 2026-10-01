# quanto

Turn messy human text into well-typed values and back: `5'11"`, `180cm` and `1,8 m` all parse into the same typed length, which can be converted, compared and formatted. The same idea covers weights, durations, temperatures, percentages and custom types.

Pre-release. The design and its open questions are in the repository's `DESIGN.md`. Money is in [`@quanto/money`](../money/README.md), and dates and times in [`@quanto/datetime`](../datetime/README.md).

## Using quanto

Read this before using quanto in an app. To write a codec, read [AUTHORING.md](./AUTHORING.md).

### Parse, then check `ok`

```ts
import { length } from 'quanto/codecs';

const height = length({ defaultUnit: 'in' });
const result = height.parse(text, { locale: 'en-GB' });

if (result.ok) {
  result.value;    // { value: 71, unit: 'in' }
} else {
  result.issues;   // [{ code: 'unknown_unit', message: '…' }]
}
```

`parse` never throws on bad input. Show `issues` to the user; localize by `code`, not `message`.

### Store `{ raw, value }`

```ts
if (result.ok) save({ raw: text, value: result.value });
```

- **`value`** is authoritative. Read it, compute with it, send it to the server.
- **`raw`** is what the user typed. Keep it so re-editing shows their text, and for audits.
- **Never re-parse `raw`** to get the value back. Relative input (`tomorrow`) would give a different answer.
- **On the server, validate `value` with `codec.schema`** (a Standard Schema) and store its output. Don't parse on the server.
- **To display stored values that may be malformed**, use `formatWithFallback(codec, value, fallback)`. `format` throws on them.

### Optional extras

- **`result.context`** (`{ locale, now? }`): what the parse was based on. Store it separately, only if you need to replay a parse later (audits, debugging, migrations): `codec.parse(raw, context)` reproduces the value on the same versions of quanto and the package that owns the codec (`@quanto/money`, `@quanto/datetime`).
- **`{ raw, issues }`**: a field that didn't parse. Usually you block the submit instead of storing it. Keep it only for drafts, where the user's bad text must survive.

### Pass context on the server

In a browser, omit `ctx.now`: the machine clock is what the user means. When parsing on a user's behalf on a server, pass the user's `locale` and `now` (with their UTC offset), or `tomorrow` resolves in the server's time zone.
