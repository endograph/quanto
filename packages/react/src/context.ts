import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { Ctx } from 'quanto';

const QuantoContext = createContext<Ctx>({});

/**
 * Sets the parse and format context (`locale`, `now`) for every quanto field inside. Without it, fields
 * use `en-US`; the user's locale is never read from the browser implicitly, so server and client
 * render the same text. In a browser, leave `now` unset to use the machine's clock.
 */
export function QuantoProvider({ ctx, children }: { readonly ctx: Ctx; readonly children?: ReactNode }): ReactNode {
  return createElement(QuantoContext.Provider, { value: ctx }, children);
}

/** The context from the nearest `QuantoProvider`, or `{}`. */
export const useQuantoCtx = (): Ctx => useContext(QuantoContext);
