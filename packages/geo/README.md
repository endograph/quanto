# @quantojs/geo

Geographic coordinates for [quanto](https://github.com/endograph/quanto/blob/main/packages/quanto/README.md): `40.7128, -74.0060`, `40.7128° N, 74.0060° W`, `40°42'46" N 74°0'22" W`, `lat 40.7128, lng -74.0060` and plus codes like `849VCWC8+R9` parse into `{ lat, lng }` in decimal degrees (WGS 84).

```ts
import { coordinates, degreesMinutesSeconds, distance, toPlusCode } from '@quantojs/geo';

coordinates().parse('40.7128, -74.0060');                      // { lat: 40.7128, lng: -74.006 }
coordinates().parse('40°42\'46" N 74°0\'22" W');               // { lat: 40.712778, lng: -74.006111 }
coordinates().parse('40,7128 -74,0060', { locale: 'de-DE' });  // { lat: 40.7128, lng: -74.006 }
coordinates().parse('849VCWC8+R9');                            // { lat: 37.4220625, lng: -122.0840625 }: the code's center
coordinates({ order: 'lngLat' }).parse('[-74.0060, 40.7128]'); // { lat: 40.7128, lng: -74.006 }
coordinates({ geohash: true }).parse('dr5regw3p');             // { lat: 40.712779, lng: -74.005988 }
coordinates().format({ lat: 40.7128, lng: -74.006 });          // '40.7128° N, 74.006° W'
coordinates({ format: degreesMinutesSeconds }).format({ lat: 40.7128, lng: -74.006 });  // '40°42\'46.1" N, 74°0\'21.6" W'
toPlusCode({ lat: 40.7128, lng: -74.006 });                    // '87G7PX7V+4J'
distance({ lat: 40.7128, lng: -74.006 }, { lat: 51.5072, lng: -0.1276 });  // 5570250 (meters)
```

- **Notations:** decimal degrees, hemisphere letters or words before or after each part (`N40.7128`, `40.7128N`, `40.7128 North`), labels (`lat`, `lng`, `lon`, `long`, `latitude`, `longitude`), degrees, minutes and seconds, degrees and decimal minutes (`40°42.767' N`), and full plus codes. With letters or labels, the two parts come in either order. A sign that contradicts its letter (`-40 N`) is an issue.
- **Order:** a bare pair is latitude first, as people write it and map apps copy it. `order: 'lngLat'` reads GeoJSON's order. A pair out of range in the field's order is an issue, never swapped silently; when the swapped reading is in range, it's offered as an alternative.
- **Separators:** a comma, a semicolon or a space. A comma between digits is a decimal comma where the locale writes decimals with one (`40,7128; -74,0060` in de-DE) and a separator elsewhere; a point is always a decimal point, so copied `40.7128, -74.0060` reads everywhere.
- **Plus codes** read as the center of the code's area. Short codes (`Q2PQ+6R New York`) need a reference location, so they're an issue: enter the full code.
- **Geohashes** are opt-in (`geohash: true`), since ordinary words can be geohashes (`denver`). They need at least 5 characters and read as the center of the cell. Text that reads both ways (`40n74w`) is `ambiguous`.
- **Formatting** prints decimal degrees to 6 places (about 0.1 m) with hemisphere letters, in the field's order. `degreesMinutesSeconds`, `degreesDecimalMinutes`, `plusCode` and `geohash` are ready-made formatters for the `format` option.
- **Operations:** `toPlusCode(coords, codeLength = 10)`, `toGeohash(coords, precision)` and `distance(a, b)`, the great-circle distance in meters on a sphere of the Earth's mean radius (6,371,008.8 m).
- **Still evolving.** Parse results may change between releases as notations are added (UTM and MGRS are next).

`quanto` is a peer dependency.
