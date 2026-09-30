import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto/codecs';

/**
 * Data rate units. Base unit: bits per second. Bits and bytes differ only by case (`Mb/s`, `MB/s`), so
 * those aliases match exactly as written. All-lowercase `mbps`, `kbps` and `gbps` are listed as bits, the
 * common case; `mb/s` is ambiguous and isn't accepted.
 */
export const dataRateUnits: {
  readonly bps: UnitDefinition;
  readonly kbps: UnitDefinition;
  readonly Mbps: UnitDefinition;
  readonly Gbps: UnitDefinition;
  readonly Bps: UnitDefinition;
  readonly kBps: UnitDefinition;
  readonly MBps: UnitDefinition;
  readonly GBps: UnitDefinition;
} = {
  bps: { toBase: 1, aliases: ['bps', 'b/s', 'bit/s', 'bits per second'] },
  kbps: { toBase: 1e3, aliases: ['kbps', 'Kbps', 'kb/s', 'Kb/s', 'kbit/s', 'kilobits per second'] },
  Mbps: { toBase: 1e6, aliases: ['Mbps', 'mbps', 'Mb/s', 'Mbit/s', 'megabits per second'] },
  Gbps: { toBase: 1e9, aliases: ['Gbps', 'gbps', 'Gb/s', 'Gbit/s', 'gigabits per second'] },
  Bps: { toBase: 8, aliases: ['B/s', 'Bps', 'bytes per second'] },
  kBps: { toBase: 8e3, aliases: ['kB/s', 'KB/s', 'kBps', 'KBps', 'kilobytes per second'] },
  MBps: { toBase: 8e6, aliases: ['MB/s', 'MBps', 'megabytes per second'] },
  GBps: { toBase: 8e9, aliases: ['GB/s', 'GBps', 'gigabytes per second'] },
};

export type DataRateUnit = keyof typeof dataRateUnits;

/** Bandwidth and transfer rates: `100 Mbps`, `1 Gbps`, `12.5 MB/s`. */
export const dataRate = <C extends DataRateUnit = DataRateUnit>(options?: QuantityOptions<DataRateUnit, C>): QuantityCodec<DataRateUnit, C> =>
  quantity<typeof dataRateUnits, C>({ id: 'dataRate', units: dataRateUnits, ...options });
