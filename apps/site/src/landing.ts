// The landing page: a ticker that types example input and shows what the real codecs parse it to,
// and the mark, which presses into its shadow. The two move together: each new example swaps in the
// next glyph, and a click on the mark moves on to the next example.
import type { Codec } from 'quanto';
import { dataSize, duration, length, speed, temperature } from 'quanto/codecs';
import { money } from 'quanto/money';
import { date, dateTime } from 'quanto-datetime';
import { cycler } from './mark';

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

const nextGlyph = cycler(mark);

const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

let example = 0;
// Counts the examples shown. A run that's no longer the latest stops, so a click cuts the current
// example short and the wait before the next automatic one starts over.
let turn = 0;

/** Types the current example, shows its value, and after a pause moves on. */
async function play(): Promise<void> {
  const mine = ++turn;
  const [id, codec, text] = examples[example]!;
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
      if (mine !== turn) return;
    }
  await wait(still ? 0 : 260);
  if (mine !== turn) return;
  ticker.classList.add('done');
  await wait(2400);
  if (mine === turn) advance();
}

/** Moves to the next example and the next glyph, together. */
function advance(): void {
  example = (example + 1) % examples.length;
  nextGlyph();
  void play();
}

el('mark-button').addEventListener('click', advance);
void play();
