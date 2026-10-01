// A stand-in for a language model, so the demo's external codec needs no API key. It reads a few vague
// phrases a unit parser can't, and hands everything else to the duration codec. Like a real service it
// answers after a delay, honours the abort signal, and can be down.
import type { ParseOutcome, Quantity } from 'quanto';
import { duration, type DurationUnit } from 'quanto/codecs';

const durations = duration();

/** What the "model" makes of phrases with no number in them. */
const vague: Readonly<Record<string, Quantity<DurationUnit>>> = {
  'a couple of hours': { value: 2, unit: 'h' },
  'a couple hours': { value: 2, unit: 'h' },
  'a few minutes': { value: 5, unit: 'min' },
  'a few hours': { value: 3, unit: 'h' },
  'a few days': { value: 3, unit: 'd' },
  'a little while': { value: 15, unit: 'min' },
  'all afternoon': { value: 4, unit: 'h' },
  'all day': { value: 8, unit: 'h' },
  'a fortnight': { value: 2, unit: 'wk' },
  'the weekend': { value: 2, unit: 'd' },
};

/** Phrases the model reads, for the demo's chips. */
export const vaguePhrases: readonly string[] = Object.keys(vague);

/** Flip `down` to make every request fail, as an outage would. */
export const model = { down: false };

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

/**
 * Reads `text` as a duration. Resolves with issues when it can't make sense of the text, and rejects
 * when the model is down: those are different things to the field.
 */
export async function readDuration(text: string, init: { readonly locale: string; readonly signal?: AbortSignal | undefined }): Promise<ParseOutcome<Quantity<DurationUnit>>> {
  await delay(600 + Math.random() * 600, init.signal);
  if (model.down) throw new Error('The model is unavailable.');
  const phrase = vague[text.toLowerCase().replace(/\s+/g, ' ')];
  if (phrase) return { ok: true, value: phrase };
  const parsed = durations.parse(text, { locale: init.locale });
  if (parsed.ok) return { ok: true, value: parsed.value };
  return { ok: false, issues: [{ code: 'unparseable', message: `The model couldn't read that as a length of time.` }] };
}
