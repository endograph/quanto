// Types into a real field from outside it, for the page's examples. The text goes in through the same
// DOM events a person's keystrokes produce, so the field behaves exactly as it would for them: the echo
// updates per character and the commit fires onChange.

const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
const runs = new WeakMap<HTMLInputElement, number>();

export const still: boolean = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Replaces the input's text. React tracks the value property, so it has to be set natively. */
export function setText(input: HTMLInputElement, text: string): void {
  setValue.call(input, text);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Stops whatever is typing into the input. */
export function stop(input: HTMLInputElement): void {
  runs.set(input, (runs.get(input) ?? 0) + 1);
}

/**
 * Types `text` into the input a character at a time, then commits it the way leaving the field would,
 * so a formatted-on-blur field tidies it. `delay` replaces the pause between clearing the field and the
 * first character. Resolves false if something else took over the input.
 */
export async function type(input: HTMLInputElement, text: string, { delay }: { readonly delay?: number | undefined } = {}): Promise<boolean> {
  stop(input);
  const run = runs.get(input);
  const live = (): boolean => runs.get(input) === run;
  if (still) setText(input, text);
  else
    for (let i = 0; i <= text.length; i++) {
      setText(input, text.slice(0, i));
      await wait(i === 0 && delay !== undefined ? delay : 40 + Math.random() * 50);
      if (!live()) return false;
    }
  await wait(still ? 0 : 280);
  if (!live()) return false;
  input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  return true;
}
