import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto/codecs';

/** Frequency units. Base unit: the hertz. There's no millihertz, so `mhz` means megahertz. */
export const frequencyUnits: {
  readonly Hz: UnitDefinition;
  readonly kHz: UnitDefinition;
  readonly MHz: UnitDefinition;
  readonly GHz: UnitDefinition;
  readonly rpm: UnitDefinition;
} = {
  Hz: { toBase: 1, aliases: ['Hz', 'hertz'] },
  kHz: { toBase: 1e3, aliases: ['kHz', 'kilohertz'] },
  MHz: { toBase: 1e6, aliases: ['MHz', 'megahertz'] },
  GHz: { toBase: 1e9, aliases: ['GHz', 'gigahertz'] },
  rpm: { toBase: 1 / 60, aliases: ['rpm', 'rev/min', 'r/min', 'revolutions per minute'] },
};

export type FrequencyUnit = keyof typeof frequencyUnits;

/** Frequencies and rotational speeds: `440 Hz`, `2.4 GHz`, `3000 rpm`. Beats per minute aren't included. */
export const frequency = <C extends FrequencyUnit = FrequencyUnit>(options?: QuantityOptions<FrequencyUnit, C>): QuantityCodec<FrequencyUnit, C> =>
  quantity<typeof frequencyUnits, C>({ id: 'frequency', units: frequencyUnits, ...options });
