import { quantity, type QuantityCodec, type QuantityOptions, type UnitDefinition } from 'quanto';

/**
 * Torque units. Base unit: the newton meter. Pound-feet and foot-pounds are the same unit, written either
 * way round, as on torque wrenches and spec sheets.
 */
export const torqueUnits: {
  readonly Nm: UnitDefinition;
  readonly kNm: UnitDefinition;
  readonly lbft: UnitDefinition;
  readonly lbin: UnitDefinition;
  readonly kgfm: UnitDefinition;
} = {
  Nm: { toBase: 1, aliases: ['N·m', 'Nm', 'N m', 'N-m', 'newton meter', 'newton meters', 'newton metre', 'newton metres', 'newton-meters', 'newton-metres'] },
  kNm: { toBase: 1e3, aliases: ['kN·m', 'kNm', 'kN m', 'kN-m', 'kilonewton meters', 'kilonewton metres'] },
  lbft: { toBase: 1.3558179483314003, aliases: ['lb-ft', 'lb ft', 'lb·ft', 'lbf·ft', 'lbf-ft', 'lbs-ft', 'ft-lb', 'ft lb', 'ft·lb', 'ft-lbs', 'ft-lbf', 'ft·lbf', 'pound-feet', 'pound feet', 'foot-pounds', 'foot pounds'] },
  lbin: { toBase: 0.11298482902761668, aliases: ['lb-in', 'lb in', 'lb·in', 'lbf·in', 'lbf-in', 'in-lb', 'in lb', 'in·lb', 'in-lbs', 'in-lbf', 'pound-inches', 'inch-pounds', 'inch pounds'] },
  kgfm: { toBase: 9.80665, aliases: ['kgf·m', 'kgf-m', 'kgf m', 'kg·m', 'kg-m', 'kilogram-force meters', 'kilogram-force metres'] },
};

export type TorqueUnit = keyof typeof torqueUnits;

/** Torque: `250 N·m`, `184 lb-ft`, `35 in-lb`. */
export const torque = <C extends TorqueUnit = TorqueUnit>(options?: QuantityOptions<TorqueUnit, C>): QuantityCodec<TorqueUnit, C> =>
  quantity<typeof torqueUnits, C>({ id: 'torque', units: torqueUnits, ...options });
