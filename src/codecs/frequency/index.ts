import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

/** Frequency units. Base unit: the hertz. There's no millihertz, so `mhz` means megahertz. */
export const frequencyUnits: {
  readonly Hz: UnitDefinition;
  readonly kHz: UnitDefinition;
  readonly MHz: UnitDefinition;
  readonly GHz: UnitDefinition;
  readonly rpm: UnitDefinition;
  readonly bpm: UnitDefinition;
} = {
  Hz: { toBase: 1, aliases: ['Hz', 'hertz'] },
  kHz: { toBase: 1e3, aliases: ['kHz', 'kilohertz'] },
  MHz: { toBase: 1e6, aliases: ['MHz', 'megahertz'] },
  GHz: { toBase: 1e9, aliases: ['GHz', 'gigahertz'] },
  rpm: { toBase: 1 / 60, aliases: ['rpm', 'rev/min', 'r/min', 'revolutions per minute'] },
  bpm: { toBase: 1 / 60, aliases: ['bpm', 'beats per minute'] },
};

export type FrequencyUnit = keyof typeof frequencyUnits;

/** Frequencies and rates per minute: `440 Hz`, `2.4 GHz`, `3000 rpm`, `120 bpm`. */
export const frequency = <C extends FrequencyUnit = FrequencyUnit>(options?: QuantityOptions<FrequencyUnit, C>): QuantityCodec<FrequencyUnit, C> =>
  quantity<typeof frequencyUnits, C>({ id: 'frequency', units: frequencyUnits, ...options });
