import { test } from 'vitest';
import { roundTrip, runFixtures } from 'quanto/testing';
import fixtures from './fixtures.json';
import { cssColor } from './index';
import type { CssColor } from '../value';

runFixtures(cssColor, fixtures, { test });

const values: CssColor[] = [
  { space: 'srgb', coords: [0, 170 / 255, 1], alpha: 1 },
  { space: 'srgb', coords: [0, 170 / 255, 1], alpha: 128 / 255 },
  { space: 'srgb', coords: [0, 0, 0], alpha: 0 },
  { space: 'srgb', coords: [0.1, 0.2, 0.3], alpha: 0.5 },
  { space: 'srgb', coords: [0.123456789, 0.5, 1], alpha: 1 },
  { space: 'srgb', coords: [1.2, -0.1, 0.5], alpha: 0.25 },
  { space: 'hsl', coords: [200, 100, 50], alpha: 1 },
  { space: 'hsl', coords: [359.5, 33.3, 12.25], alpha: 0.1 },
  { space: 'hwb', coords: [200, 10, 20], alpha: 1 },
  { space: 'lab', coords: [50, 40, -20], alpha: 1 },
  { space: 'lch', coords: [50, 30, 200], alpha: 0.5 },
  { space: 'oklab', coords: [0.7, 0.1, -0.1], alpha: 1 },
  { space: 'oklch', coords: [0.7, 0.15, 230], alpha: 1 },
  { space: 'oklch', coords: [0, 0, 0], alpha: 1 },
  { space: 'display-p3', coords: [1, 0, 0], alpha: 1 },
  { space: 'srgb-linear', coords: [0.2, 0.4, 0.6], alpha: 1 },
  { space: 'a98-rgb', coords: [0.2, 0.4, 0.6], alpha: 1 },
  { space: 'prophoto-rgb', coords: [0.2, 0.4, 0.6], alpha: 1 },
  { space: 'rec2020', coords: [0.2, 0.4, 0.6], alpha: 1 },
  { space: 'xyz-d50', coords: [0.2, 0.4, 0.6], alpha: 1 },
  { space: 'xyz-d65', coords: [0.0000001, 0.4, 1.5], alpha: 1 },
];
for (const locale of ['en-US', 'de-DE', 'fr-FR']) roundTrip(cssColor(), values, { test, ctx: { locale } });
roundTrip(cssColor({ bare: false }), values, { test });
