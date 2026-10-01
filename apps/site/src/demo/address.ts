// A stand-in for an address service, so the completions demo needs no API key. Like a real one (Google
// Places, say) it completes text into labels and fetches the address when one is chosen, answers after
// a delay, and honours the abort signal. The parse is built from the completions: one candidate is the
// address, several are ambiguous, and the field offers them.
import { defineExternalCodec, parseFromCompletions, type Completion } from 'quanto';

export interface Address {
  readonly street: string;
  readonly locality: string;
  readonly region: string;
  readonly postalCode: string;
}

const ADDRESSES: readonly Address[] = [
  { street: '12 Main St', locality: 'Springfield', region: 'IL', postalCode: '62701' },
  { street: '12 Main St', locality: 'Springfield', region: 'MO', postalCode: '65806' },
  { street: '12 Main St', locality: 'Springfield', region: 'MA', postalCode: '01103' },
  { street: '120 Main St', locality: 'Springfield', region: 'IL', postalCode: '62701' },
  { street: '1600 Amphitheatre Pkwy', locality: 'Mountain View', region: 'CA', postalCode: '94043' },
  { street: '1 Infinite Loop', locality: 'Cupertino', region: 'CA', postalCode: '95014' },
  { street: '350 5th Ave', locality: 'New York', region: 'NY', postalCode: '10118' },
  { street: '221 Baker St', locality: 'Portland', region: 'OR', postalCode: '97201' },
  { street: '221 Baker St', locality: 'Portland', region: 'ME', postalCode: '04101' },
];

/** Example input for the demo's chips. */
export const addressExamples: readonly string[] = ['1600 amph', '12 Main St', '221 baker portland', '350 5th'];

export const formatAddress = (a: Address): string => `${a.street}, ${a.locality}, ${a.region} ${a.postalCode}`;

const words = (text: string): string[] => text.toLowerCase().replace(/[,.]/g, ' ').split(/\s+/).filter(Boolean);

/** Every word typed starts a word of the address, in any order: `221 baker portland`. */
const matches = (address: Address, text: string): boolean => {
  const label = words(formatAddress(address));
  return words(text).every((typed) => label.some((word) => word.startsWith(typed)));
};

/** Waits `ms`, or rejects with the signal's reason once it aborts. */
function delay(ms: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(signal.reason);
    }, { once: true });
  });
}

/** Counts the stub's calls, as a billed service would, so the demo can show what typing costs. */
export const calls = { complete: 0, details: 0 };

/** The stub's autocomplete: labels only. Choosing one fetches the address, like a details call. */
async function complete(text: string, ctx: { readonly signal?: AbortSignal | undefined }): Promise<readonly Completion<Address>[]> {
  calls.complete += 1;
  await delay(250, ctx.signal);
  return ADDRESSES.filter((a) => matches(a, text)).map((a) => ({
    label: formatAddress(a),
    id: formatAddress(a),
    resolve: async (resolveCtx) => {
      calls.details += 1;
      await delay(300, resolveCtx?.signal as AbortSignal | undefined);
      return a;
    },
  }));
}

/** Text that is a whole address, as written. */
const exact = (completions: readonly Completion<Address>[], text: string): Completion<Address> | undefined =>
  completions.find((c) => words(c.label).join(' ') === words(text).join(' '));

export const address = defineExternalCodec<Address>({
  id: 'address',
  // One candidate, or the one written out in full, is the address. Several are ambiguous: never "the
  // first", since `12 Main St` also completes to `120 Main St`.
  parse: parseFromCompletions((text, ctx) => complete(text, { signal: ctx.signal as AbortSignal | undefined }), {
    accept: (completions, text) => exact(completions, text) ?? (completions.length === 1 ? completions[0] : undefined),
  }),
  complete: (text, ctx) => complete(text, { signal: ctx.signal as AbortSignal | undefined }),
  format: formatAddress,
  check: (value) => {
    const a = value as Partial<Address> | null;
    return typeof a === 'object' && a !== null && ['street', 'locality', 'region', 'postalCode'].every((k) => typeof a[k as keyof Address] === 'string')
      ? []
      : [{ message: 'Expected { street, locality, region, postalCode }.' }];
  },
});
