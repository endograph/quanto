// The landing page: the big field from the playground, without its switches, and the mark, which presses into
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
// The examples for the chip row, which stays one line and scrolls if it must.
const examples = ['€5-10', '10^100ℓₚ', 'tomorrow', '24×36in', `about 5'11"`, '(415) 555-2671', '451°', '455hz', `40°42'46"N 74°0'22"W`];
createRoot(el('omni')).render(<Omni examples={examples} labels={['input', 'result']} handle={omni} onExample={nextGlyph} />);

/**
 * Copies text. The Clipboard API exists only in secure contexts, so over plain http on another host (a
 * dev server on the LAN) it falls back to copying a selection, which browsers still allow on a click.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      area.remove();
    }
  }
}

// The install button copies its command, and says so for a moment.
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', async () => {
    // Nothing was copied, so don't say it was.
    if (!(await copy(button.querySelector('code')!.textContent!))) return;
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
