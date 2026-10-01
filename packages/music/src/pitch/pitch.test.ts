import { test } from 'vitest';
import { quantityWithin, roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { pitch } from './index';

runFixtures(pitch, fixtures, { test });

const values = [
  { value: 69, unit: 'note' },
  { value: 58, unit: 'note' },
  { value: 0, unit: 'note' },
  { value: 69.15, unit: 'note' },
  { value: 440, unit: 'Hz' },
  { value: 261.63, unit: 'Hz' },
] as const;
for (const locale of ['en-US', 'de-DE', 'fr-FR', 'pt-BR', 'sv-SE']) {
  for (const key of [undefined, 'F major', 'F# major', 'D minor']) {
    roundTrip(pitch(), values, { test, ctx: { locale, music: { key } }, same: quantityWithin(pitch(), { places: 3 }) });
  }
}
