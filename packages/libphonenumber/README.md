# @quantojs/libphonenumber

Phone numbers for [quanto](https://github.com/endograph/quanto/blob/main/packages/quanto/README.md), built on [libphonenumber-js](https://gitlab.com/catamphetamine/libphonenumber-js), the JavaScript port of Google's libphonenumber: `(415) 555-2671`, `+44 20 7946 0958`, `0049 30 123456` and `tel:+1-415-555-2671` parse into E.164 strings.

```ts
import { phoneNumber } from '@quantojs/libphonenumber';

phoneNumber().parse('(415) 555-2671');                                 // '+14155552671'
phoneNumber().parse('020 7946 0958', { locale: 'en-GB' });             // '+442079460958'
phoneNumber({ defaultCountry: 'DE' }).parse('030 123456');             // '+4930123456'
phoneNumber().parse('+1 415 555 2671 ext. 123');                       // '+14155552671;ext=123'
phoneNumber().format('+442079460958');                                 // '+44 20 7946 0958'
phoneNumber({ style: 'national' }).format('+14155552671');             // '(415) 555-2671'
phoneNumber({ style: 'national' }).format('+442079460958');            // '+44 20 7946 0958': not a US number
```

- **The value** is an E.164 string, `'+14155552671'`, with an extension as RFC 3966's `;ext=` suffix: `'+14155552671;ext=123'`. Parsing requires a valid number; the structural check (`codec.schema`, and what `format` accepts) requires only a possible one, the right length for its country, so a stored number stays readable after a metadata update.
- **National numbers** are read in `defaultCountry` (ISO 3166-1 alpha-2), else the locale's region, so the same digits can be different numbers: `(415) 555-2671` is a San Francisco number in en-US and a German one in de-DE. Numbers starting with `+`, `00` or the country's own international prefix (`011` in the US) don't need one.
- **Accepted:** spaces, dashes, dots, slashes and parentheses, `+44 (0)20`, `tel:` URIs, extensions (`ext. 123`, `x123`, `#123`, `;ext=123`), and full-width and Arabic-Indic digits. Text with other words (`call 415 555 2671`) and vanity letters (`1-800-FLOWERS`) are `unparseable`.
- **Valid, not just possible.** A number must be valid per the metadata: the right length and an allocated range. Short codes and emergency numbers (`911`, `112`) aren't phone numbers here.
- **`style: 'national'`** formats a number as its country writes it, when it reads back in the field's country; any other number keeps its country code, so formatted text always parses back to the same value.
- **Validity changes between releases.** Numbering plans change, and libphonenumber-js updates its metadata with them, so a number rejected today may be valid after an update, and the other way around. Stored values are checked only for the right length, so they still display after an update; to recheck validity, parse `format(value)` again.
- Uses libphonenumber-js's `min` metadata (about 80 kB, 20 kB gzipped), which validates but can't tell mobile numbers from landlines.

`quanto` is a peer dependency.
