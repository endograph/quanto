import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from '../quantity';

/**
 * Data size units. Base unit: the byte. `KB`, `MB`, … are decimal (1000), as on drives and in macOS;
 * `KiB`, `MiB`, … are binary (1024). There are no bit units, so `Mb` and `mb` also mean megabytes.
 */
export const dataSizeUnits: {
  readonly B: UnitDefinition;
  readonly kB: UnitDefinition;
  readonly MB: UnitDefinition;
  readonly GB: UnitDefinition;
  readonly TB: UnitDefinition;
  readonly PB: UnitDefinition;
  readonly KiB: UnitDefinition;
  readonly MiB: UnitDefinition;
  readonly GiB: UnitDefinition;
  readonly TiB: UnitDefinition;
  readonly PiB: UnitDefinition;
} = {
  B: { toBase: 1, aliases: ['B', 'byte', 'bytes'] },
  kB: { toBase: 1e3, aliases: ['kB', 'KB', 'kilobyte', 'kilobytes'] },
  MB: { toBase: 1e6, aliases: ['MB', 'megabyte', 'megabytes', 'meg', 'megs'] },
  GB: { toBase: 1e9, aliases: ['GB', 'gigabyte', 'gigabytes', 'gig', 'gigs'] },
  TB: { toBase: 1e12, aliases: ['TB', 'terabyte', 'terabytes'] },
  PB: { toBase: 1e15, aliases: ['PB', 'petabyte', 'petabytes'] },
  KiB: { toBase: 2 ** 10, aliases: ['KiB', 'kibibyte', 'kibibytes'] },
  MiB: { toBase: 2 ** 20, aliases: ['MiB', 'mebibyte', 'mebibytes'] },
  GiB: { toBase: 2 ** 30, aliases: ['GiB', 'gibibyte', 'gibibytes'] },
  TiB: { toBase: 2 ** 40, aliases: ['TiB', 'tebibyte', 'tebibytes'] },
  PiB: { toBase: 2 ** 50, aliases: ['PiB', 'pebibyte', 'pebibytes'] },
};

export type DataSizeUnit = keyof typeof dataSizeUnits;

/** Storage and file sizes: `500 MB`, `1.5 GB`, `4 GiB`, `2 TB`. */
export const dataSize = <C extends DataSizeUnit = DataSizeUnit>(options?: QuantityOptions<DataSizeUnit, C>): QuantityCodec<DataSizeUnit, C> =>
  quantity<typeof dataSizeUnits, C>({ id: 'dataSize', units: dataSizeUnits, ...options });
