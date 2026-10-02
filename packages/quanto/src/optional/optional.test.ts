import { test } from 'vitest';
import { length } from '@quantojs/common';
import type { QuantityOptions } from '../quantity/codec';
import { runFixtures } from '../testing';
import fixtures from './fixtures.length.json';
import { optional } from './index';

runFixtures((options?: QuantityOptions<'mm' | 'cm' | 'm' | 'km' | 'in' | 'ft' | 'yd' | 'mi'>) => optional(length(options)), fixtures, { test });
