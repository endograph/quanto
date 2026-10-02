import { formatNumber, type ResolvedCtx } from 'quanto';
import { minorDigits } from './currencies';
import type { Money } from './types';

const cache = new Map<string, Intl.NumberFormat>();

/**
 * Money in Intl's full currency styles: `US$12.34`, `12,34 €`, `12.34 US dollars`. Display-only: Intl's
 * output varies between ICU versions and isn't guaranteed to parse back. Decimal places come from the
 * bundled table, not Intl's. Falls back to the amount and ISO code if Intl doesn't know the currency.
 */
export function intlMoney(options?: { readonly currencyDisplay?: 'symbol' | 'narrowSymbol' | 'code' | 'name' }): (value: Money, ctx: ResolvedCtx) => string {
  const currencyDisplay = options?.currencyDisplay ?? 'symbol';
  return (value, ctx) => {
    const digits = minorDigits(value.currency);
    const amount = value.minorUnits / 10 ** digits;
    const tag = ctx.locale.tag;
    const key = `${tag}|${value.currency}|${currencyDisplay}`;
    try {
      let f = cache.get(key);
      if (!f) {
        f = new Intl.NumberFormat(tag, { style: 'currency', currency: value.currency, currencyDisplay, minimumFractionDigits: digits, maximumFractionDigits: digits });
        cache.set(key, f);
      }
      return f.format(amount);
    } catch {
      return `${formatNumber(amount, ctx, { minFractionDigits: digits, maxFractionDigits: digits })} ${value.currency}`;
    }
  };
}
