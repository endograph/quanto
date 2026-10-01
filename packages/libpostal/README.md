# @quantojs/libpostal

Mailing addresses for [quanto](https://github.com/endograph/quanto#readme), parsed by [libpostal](https://github.com/openvenues/libpostal): `1600 amphitheatre pkwy, mountain view, california 94043` becomes a normalized address you can store, validate and format back.

```ts
import { address } from '@quantojs/libpostal';
import postal from 'node-postal';

const shipping = address({
  libpostal: async (text) => postal.parser.parse_address(text),
  defaultCountry: 'US',
});

await shipping.parse('1600 amphitheatre pkwy, mountain view, california 94043');
// { ok: true, value: { lines: ['1600 amphitheatre pkwy'], locality: 'mountain view',
//                      region: 'CA', postalCode: '94043', country: 'US' }, … }

shipping.format({ lines: ['Hauptstraße 5'], locality: 'Berlin', postalCode: '10115', country: 'DE' });
// 'Hauptstraße 5, 10115 Berlin, Germany'
```

## You run libpostal

libpostal is an open-source statistical address parser trained on over a billion addresses, for most countries. It runs on CPU and is fast (10–30k addresses a second per thread), but its model is about 2 GB, so this package doesn't depend on it: you pass a `libpostal` function from text to libpostal's `[{ label, value }]`. Run it on a server, never in a browser.

- **In-process**, with [node-postal](https://github.com/openvenues/node-postal) (needs libpostal installed):

  ```ts
  address({ libpostal: async (text) => postal.parser.parse_address(text) });
  ```

- **As a service**, such as [`pelias/libpostal-service`](https://github.com/pelias/libpostal-service) in Docker:

  ```ts
  address({
    libpostal: async (text, { signal }) => {
      const res = await fetch(`http://libpostal:4400/parse?address=${encodeURIComponent(text)}`, { signal });
      if (!res.ok) throw new Error(`libpostal answered ${res.status}`);
      return res.json();
    },
  });
  ```

Reject when libpostal can't answer: a failed service is never turned into issues. In a browser field, the codec's parse is a call to your server, which runs this codec.

## What you get

- **`Address`**: `lines` (building, street, unit, PO box, in the order written), and optionally `dependentLocality`, `locality`, `region`, `postalCode` and `country` (ISO 3166-1 alpha-2).
- **Text as typed.** libpostal lowercases; the codec restores what was typed, and doesn't guess capitals.
- **Normalized regions, postal codes and countries:** `California` → `CA` (US, Canada, Australia), `sw1a2aa` → `SW1A 2AA` (countries with one postal format), `Deutschland`, `UK`, `USA` → `DE`, `GB`, `US`.
- **`defaultCountry`** for addresses that don't name one. Formatting leaves it out, and names other countries in the reader's language (`ctx.locale`).
- **Issues:** `unparseable` with no street line, no city or postal code, or an unknown country.
- **Formatting** in each country's order: `…, Mountain View, CA 94043`, `…, 10115 Berlin`, `…, London SW1A 2AA`.

libpostal splits an address into parts; it doesn't check the address exists, and has no completions. For those, use a geocoding API in your own external codec. The design is in the repository's [`DESIGN.md`](https://github.com/endograph/quanto/blob/main/DESIGN.md), "Addresses".

`quanto` is a peer dependency.
