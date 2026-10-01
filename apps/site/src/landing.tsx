// The landing page: the big field from the demo, without its switches, and the mark, which presses into
// its shadow. The two move together: each new example the field types swaps in the next glyph, and a
// click on the mark moves the field on to the next example. Above them, the install command to copy and
// the GitHub link with its star count.
import { createRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Omni, type OmniHandle } from './demo/omni';
import { cycler } from './mark';

const el = (id: string): HTMLElement => document.getElementById(id)!;

const nextGlyph = cycler(el('mark'));
const omni = createRef<OmniHandle>();
el('mark-button').addEventListener('click', () => omni.current?.next());
// The examples that fit the chip row on one line.
const examples = ['€5-10', 'tomorrow', '10^100ℓₚ', `about 5'11"`, 'October 3 to 5', '1h30', 'π rad', '451°'];
createRoot(el('omni')).render(<Omni examples={examples} labels={['input', 'result']} handle={omni} onExample={nextGlyph} />);

// The install button copies its command, and says so for a moment.
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(button.querySelector('code')!.textContent!);
    } catch {
      return; // Nothing was copied, so don't say it was.
    }
    button.dataset.copied = '';
    setTimeout(() => delete button.dataset.copied, 1600);
  });
}

// The star count, fetched at most once an hour per visitor. It stays hidden until there's one to show.
const stars = el('stars');
const key = 'quanto-stars';
const hour = 60 * 60 * 1000;

function showStars(count: number): void {
  if (count < 1) return;
  stars.textContent = count < 1000 ? String(count) : `${Math.round(count / 100) / 10}k`;
  stars.setAttribute('aria-label', `${count} stars`);
  stars.hidden = false;
}

async function loadStars(): Promise<void> {
  try {
    const cached = JSON.parse(localStorage.getItem(key) ?? 'null') as { count: number; at: number } | null;
    if (cached && Date.now() - cached.at < hour) return showStars(cached.count);
  } catch {}
  const res = await fetch('https://api.github.com/repos/endograph/quanto');
  if (!res.ok) return;
  const { stargazers_count: count } = (await res.json()) as { stargazers_count: number };
  localStorage.setItem(key, JSON.stringify({ count, at: Date.now() }));
  showStars(count);
}

void loadStars().catch(() => {});
