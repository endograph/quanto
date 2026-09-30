// Fixtures for quantity() itself, with small custom tables for behaviour no built-in table exercises.
import { test } from 'vitest';
import { runFixtures } from '../../testing';
import dataFixtures from './fixtures.data.json';
import powerFixtures from './fixtures.power.json';
import { quantity, type QuantityOptions } from './index';

// Aliases that differ only by case between units (mW/MW) match exactly; the rest stay case-insensitive.
const powerUnits = {
  milliwatt: { toBase: 0.001, aliases: ['mW', 'milliwatt', 'milliwatts'] },
  W: { toBase: 1, aliases: ['W', 'watt', 'watts'] },
  kW: { toBase: 1000, aliases: ['kW', 'kilowatt', 'kilowatts'] },
  megawatt: { toBase: 1000000, aliases: ['MW', 'megawatt', 'megawatts'] },
};
const power = (options?: QuantityOptions<keyof typeof powerUnits>) => quantity({ id: 'power', units: powerUnits, ...options });

// An explicit lowercase alias keeps "mb" meaning megabytes next to megabit "Mb". Unit IDs are spelled
// out, since IDs may not differ only by case.
const dataUnits = {
  megabyte: { toBase: 8000000, aliases: ['MB', 'mb', 'megabyte', 'megabytes'] },
  megabit: { toBase: 1000000, aliases: ['Mb', 'megabit', 'megabits'] },
};
const data = (options?: QuantityOptions<keyof typeof dataUnits>) => quantity({ id: 'data', units: dataUnits, ...options });

runFixtures(power, powerFixtures, { test });
runFixtures(data, dataFixtures, { test });
