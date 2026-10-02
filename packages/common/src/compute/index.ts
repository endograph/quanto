import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Amounts of computation. Base unit: one floating-point operation. `FLOPs` and `FLOPS` both mean a count
 * here, since this codec has no rates (those are `computeRate`), but `/s` doesn't. There's no milli-, so
 * `mflop` means mega-. `pfsDay` is a petaflop/s sustained for a day, 8.64×10¹⁹ FLOP, as in AI training budgets.
 */
export const computeUnits: {
  readonly FLOP: UnitDefinition;
  readonly kFLOP: UnitDefinition;
  readonly MFLOP: UnitDefinition;
  readonly GFLOP: UnitDefinition;
  readonly TFLOP: UnitDefinition;
  readonly PFLOP: UnitDefinition;
  readonly EFLOP: UnitDefinition;
  readonly ZFLOP: UnitDefinition;
  readonly YFLOP: UnitDefinition;
  readonly pfsDay: UnitDefinition;
} = {
  FLOP: { toBase: 1, aliases: ['FLOP', 'FLOPs', 'floating-point operations', 'floating point operations'] },
  kFLOP: { toBase: 1e3, aliases: ['kFLOP', 'kFLOPs', 'kiloflop', 'kiloflops'] },
  MFLOP: { toBase: 1e6, aliases: ['MFLOP', 'MFLOPs', 'megaflop', 'megaflops'] },
  GFLOP: { toBase: 1e9, aliases: ['GFLOP', 'GFLOPs', 'gigaflop', 'gigaflops'] },
  TFLOP: { toBase: 1e12, aliases: ['TFLOP', 'TFLOPs', 'teraflop', 'teraflops'] },
  PFLOP: { toBase: 1e15, aliases: ['PFLOP', 'PFLOPs', 'petaflop', 'petaflops'] },
  EFLOP: { toBase: 1e18, aliases: ['EFLOP', 'EFLOPs', 'exaflop', 'exaflops'] },
  ZFLOP: { toBase: 1e21, aliases: ['ZFLOP', 'ZFLOPs', 'zettaflop', 'zettaflops'] },
  YFLOP: { toBase: 1e24, aliases: ['YFLOP', 'YFLOPs', 'yottaflop', 'yottaflops'] },
  pfsDay: {
    toBase: 8.64e19,
    aliases: ['PF-days', 'PF-day', 'pfs-days', 'pfs-day', 'petaflop/s-days', 'petaflop/s-day', 'petaflop-days', 'petaflop-day'],
  },
};

export type ComputeUnit = keyof typeof computeUnits;

/** Amounts of computation: `3.8e25 FLOP`, `5 TFLOPs`, `3640 PF-days`. */
export const compute = <C extends ComputeUnit = ComputeUnit>(options?: QuantityOptions<ComputeUnit, C>): QuantityCodec<ComputeUnit, C> =>
  quantity<typeof computeUnits, C>({ id: 'compute', units: computeUnits, ...options });
