// The landing page: a ticker that types example input and shows what the real codecs parse it to,
// and the mark, which presses into its shadow and cycles glyphs when clicked.
import type { Codec } from 'quanto';
import { dataSize, duration, length, speed, temperature } from 'quanto/codecs';
import { money } from 'quanto/money';
import { date, dateTime } from 'quanto-datetime';
import { glyphs } from './glyphs';

const examples: readonly [string, Codec<unknown>, string][] = [
  ['length', length(), `5'11"`],
  ['money', money(), '€12,50'],
  ['duration', duration(), '2h30m'],
  ['date', date(), 'next fri'],
  ['dataSize', dataSize(), '1.5 GB'],
  ['dateTime', dateTime(), 'tomorrow 3pm'],
  ['temperature', temperature(), '-40°F'],
  ['speed', speed(), '65 mph'],
];

/** Compact one-line rendering of a value. */
const show = (v: unknown): string =>
  v !== null && typeof v === 'object'
    ? `{ ${Object.entries(v).map(([k, x]) => `${k}: ${JSON.stringify(x)}`).join(', ')} }`
    : JSON.stringify(v);

const el = (id: string): HTMLElement => document.getElementById(id)!;
const ticker = el('ticker') as HTMLAnchorElement;
const raw = el('raw');
const value = el('value');
const codecLabel = el('codec');
const mark = el('mark');

const press = (swap?: () => void): void => {
  mark.classList.add('pressed');
  setTimeout(() => {
    swap?.();
    mark.classList.remove('pressed');
  }, 110);
};

let glyph = 0;
el('mark-button').addEventListener('click', () => {
  press(() => {
    glyph = (glyph + 1) % glyphs.length;
    for (const path of mark.querySelectorAll('path')) path.setAttribute('d', glyphs[glyph]!);
  });
});

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function run(): Promise<never> {
  for (let i = 0; ; i = (i + 1) % examples.length) {
    const [id, codec, text] = examples[i]!;
    const result = codec.parse(text);
    ticker.href = `play/index.html?codec=${id}&q=${encodeURIComponent(text)}`;
    ticker.classList.remove('done');
    value.textContent = result.ok ? show(result.value) : result.issues[0]!.code;
    codecLabel.textContent = `// ${id}`;
    raw.textContent = '';
    if (still) raw.textContent = text;
    else
      for (const ch of text) {
        raw.textContent += ch;
        await wait(70 + Math.random() * 60);
      }
    await wait(still ? 0 : 260);
    ticker.classList.add('done');
    press();
    await wait(2400);
  }
}
run();
