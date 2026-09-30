import { expect, test } from 'vitest';
import { VERSION } from './index';

test('exports a version', () => {
  expect(VERSION).toBe('0.0.0');
});
