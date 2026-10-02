import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Computing speed. Base unit: floating-point operations per second. `TFLOPS`, `TFLOP/s` and `TFLOPs` all
 * mean a rate here; a plain `TFLOP` or `teraflop` is a count (`compute`) and isn't accepted. There's no
 * milli-, so `mflops` means mega-.
 */
export const computeRateUnits: {
  readonly FLOPS: UnitDefinition;
  readonly kFLOPS: UnitDefinition;
  readonly MFLOPS: UnitDefinition;
  readonly GFLOPS: UnitDefinition;
  readonly TFLOPS: UnitDefinition;
  readonly PFLOPS: UnitDefinition;
  readonly EFLOPS: UnitDefinition;
  readonly ZFLOPS: UnitDefinition;
  readonly YFLOPS: UnitDefinition;
} = {
  FLOPS: { toBase: 1, aliases: ['FLOPS', 'FLOP/s', 'floating-point operations per second', 'floating point operations per second'] },
  kFLOPS: { toBase: 1e3, aliases: ['kFLOPS', 'kFLOP/s', 'kiloflops', 'kiloflop/s'] },
  MFLOPS: { toBase: 1e6, aliases: ['MFLOPS', 'MFLOP/s', 'megaflops', 'megaflop/s'] },
  GFLOPS: { toBase: 1e9, aliases: ['GFLOPS', 'GFLOP/s', 'gigaflops', 'gigaflop/s'] },
  TFLOPS: { toBase: 1e12, aliases: ['TFLOPS', 'TFLOP/s', 'teraflops', 'teraflop/s'] },
  PFLOPS: { toBase: 1e15, aliases: ['PFLOPS', 'PFLOP/s', 'petaflops', 'petaflop/s'] },
  EFLOPS: { toBase: 1e18, aliases: ['EFLOPS', 'EFLOP/s', 'exaflops', 'exaflop/s'] },
  ZFLOPS: { toBase: 1e21, aliases: ['ZFLOPS', 'ZFLOP/s', 'zettaflops', 'zettaflop/s'] },
  YFLOPS: { toBase: 1e24, aliases: ['YFLOPS', 'YFLOP/s', 'yottaflops', 'yottaflop/s'] },
};

export type ComputeRateUnit = keyof typeof computeRateUnits;

/** Computing speed: `989 TFLOPS`, `1.2 EFLOP/s`, `3e14 FLOP/s`. */
export const computeRate = <C extends ComputeRateUnit = ComputeRateUnit>(options?: QuantityOptions<ComputeRateUnit, C>): QuantityCodec<ComputeRateUnit, C> =>
  quantity<typeof computeRateUnits, C>({ id: 'computeRate', units: computeRateUnits, ...options });
