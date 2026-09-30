import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

/**
 * Data rate units. Base unit: bits per second. Unit IDs spell out bits and bytes (`Mbit/s`, `MB/s`) so
 * stored values never differ only by case. Aliases for bits and bytes that differ only by case (`Mb/s`,
 * `MB/s`) match exactly as written. All-lowercase `mbps`, `kbps` and `gbps` are listed as bits, the
 * common case; `mb/s` is ambiguous and isn't accepted.
 */
export const dataRateUnits: {
  readonly 'bit/s': UnitDefinition;
  readonly 'kbit/s': UnitDefinition;
  readonly 'Mbit/s': UnitDefinition;
  readonly 'Gbit/s': UnitDefinition;
  readonly 'B/s': UnitDefinition;
  readonly 'kB/s': UnitDefinition;
  readonly 'MB/s': UnitDefinition;
  readonly 'GB/s': UnitDefinition;
} = {
  'bit/s': { toBase: 1, aliases: ['bps', 'b/s', 'bit/s', 'bits per second'] },
  'kbit/s': { toBase: 1e3, aliases: ['kbps', 'Kbps', 'kb/s', 'Kb/s', 'kbit/s', 'kilobits per second'] },
  'Mbit/s': { toBase: 1e6, aliases: ['Mbps', 'mbps', 'Mb/s', 'Mbit/s', 'megabits per second'] },
  'Gbit/s': { toBase: 1e9, aliases: ['Gbps', 'gbps', 'Gb/s', 'Gbit/s', 'gigabits per second'] },
  'B/s': { toBase: 8, aliases: ['B/s', 'Bps', 'bytes per second'] },
  'kB/s': { toBase: 8e3, aliases: ['kB/s', 'KB/s', 'kBps', 'KBps', 'kilobytes per second'] },
  'MB/s': { toBase: 8e6, aliases: ['MB/s', 'MBps', 'megabytes per second'] },
  'GB/s': { toBase: 8e9, aliases: ['GB/s', 'GBps', 'gigabytes per second'] },
};

export type DataRateUnit = keyof typeof dataRateUnits;

/** Bandwidth and transfer rates: `100 Mbps`, `1 Gbps`, `12.5 MB/s`. */
export const dataRate = <C extends DataRateUnit = DataRateUnit>(options?: QuantityOptions<DataRateUnit, C>): QuantityCodec<DataRateUnit, C> =>
  quantity<typeof dataRateUnits, C>({ id: 'dataRate', units: dataRateUnits, ...options });
