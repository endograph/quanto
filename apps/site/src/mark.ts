// The mark, on every page: it presses into its shadow, and a click swaps in the next glyph.
import { glyphs } from './glyphs';

/** Presses the mark down and lets it up again, running `swap` while it's down. */
export function press(mark: Element, swap?: () => void): void {
  mark.classList.add('pressed');
  setTimeout(() => {
    swap?.();
    mark.classList.remove('pressed');
  }, 110);
}

/** Returns a function that presses the mark and swaps in the next glyph. */
export function cycler(mark: Element): () => void {
  let glyph = 0;
  return () =>
    press(mark, () => {
      glyph = (glyph + 1) % glyphs.length;
      for (const path of mark.querySelectorAll('path')) path.setAttribute('d', glyphs[glyph]!);
    });
}

/** Makes a click on `button` press the mark inside it and cycle to the next glyph. */
export function cycleOnClick(button: HTMLElement, mark: Element): void {
  button.addEventListener('click', cycler(mark));
}
