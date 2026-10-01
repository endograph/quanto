// The playground: every panel calls the real packages.
import type { Codec, ParseResult, Quantity } from 'quanto';
import { convert } from 'quanto/quantity';
import { byId, entries, leafById, locales, type Entry } from './catalog';
import { cycleOnClick } from './mark';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const input = $<HTMLInputElement>('input');

const params = new URLSearchParams(location.search);
const state = {
  id: byId[params.get('codec') ?? ''] ? params.get('codec')! : 'any',
  locale: locales.includes(params.get('locale') ?? '') ? params.get('locale')! : 'en-US',
};
input.value = params.get('q') ?? byId[state.id]!.examples[0]!;

const esc = (s: unknown): string =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const span = (cls: string, s: string): string => `<span class="${cls}">${esc(s)}</span>`;
const str = (s: string): string => (s.includes("'") ? JSON.stringify(s) : `'${s}'`);

/** Renders a value as a JS object literal, one line when it's short. */
function pretty(v: unknown, indent = ''): string {
  if (v === null || typeof v !== 'object') return span(typeof v === 'string' ? 'j-s' : 'j-n', JSON.stringify(v));
  const inner = indent + '  ';
  if (Array.isArray(v)) {
    return `${span('j-p', '[')}\n${v.map((x) => inner + pretty(x, inner)).join(span('j-p', ',') + '\n')}\n${indent}${span('j-p', ']')}`;
  }
  const fields = Object.entries(v).filter(([, x]) => x !== undefined);
  const oneLine = fields.map(([k, x]) => `${k}: ${JSON.stringify(x)}`).join(', ');
  if (fields.every(([, x]) => x === null || typeof x !== 'object') && oneLine.length < 46) {
    return `${span('j-p', '{ ')}${fields.map(([k, x]) => `${span('j-k', k)}${span('j-p', ': ')}${pretty(x)}`).join(span('j-p', ', '))}${span('j-p', ' }')}`;
  }
  return `${span('j-p', '{')}\n${fields.map(([k, x]) => `${inner}${span('j-k', k)}${span('j-p', ': ')}${pretty(x, inner)}`).join(span('j-p', ',') + '\n')}\n${indent}${span('j-p', '}')}`;
}

/** Equal up to the formatter's rounding: numbers within a small tolerance, everything else exactly. */
function close(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= 5e-4 * Math.max(1, Math.abs(a));
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => close((a as any)[k], (b as any)[k]));
  }
  return a === b;
}

const tryFormat = (codec: Codec<any>, value: unknown, locale: string): string => {
  try {
    return codec.format(value, { locale });
  } catch (err) {
    return `⚠ ${(err as Error).message}`;
  }
};

function renderTabs(): void {
  const featured = entries.filter((e) => e.featured);
  const more = entries.filter((e) => !e.featured);
  const current = byId[state.id]!;
  $('tabs').innerHTML =
    featured
      .map((e) => `<button class="tab" role="tab" data-id="${e.id}" aria-selected="${e.id === state.id}">${esc(e.id)}</button>`)
      .join('') +
    `<select class="more${current.featured ? '' : ' active'}" id="more" aria-label="More codecs">` +
    `<option value="">more…</option>` +
    more.map((e) => `<option value="${e.id}"${e.id === state.id ? ' selected' : ''}>${esc(e.id)}</option>`).join('') +
    `</select>`;
}

function renderChips(): void {
  const entry = byId[state.id]!;
  $('chips').innerHTML =
    `<span class="overline">try</span>` +
    entry.examples
      .map((t) => {
        const ok = entry.codec.parse(t, { locale: state.locale }).ok;
        return `<button class="chip${ok ? '' : ' bad'}" data-text="${esc(t)}" title="${ok ? '' : 'produces an issue'}">${esc(t)}</button>`;
      })
      .join('');
}

function renderRight(entry: Entry, result: ParseResult<any>): void {
  if (!result.ok) {
    $('right').innerHTML =
      `<p class="overline">issues</p><div class="issues">` +
      result.issues
        .map((i: any) => `<div class="issue"><span class="tag">${esc(i.code)}</span>${i.codec ? `<span class="from">${esc(i.codec)}</span>` : ''}<p>${esc(i.message)}</p></div>`)
        .join('') +
      `</div>`;
    return;
  }
  const { locale } = state;
  const text = tryFormat(entry.codec, result.value, locale);
  const back = entry.codec.parse(text, { locale });
  const trips = back.ok && close(back.value, result.value);
  let html =
    `<p class="overline"><code>format(value, ctx)</code></p>` +
    `<p class="formatted">${esc(text)}</p>` +
    `<p class="roundtrip">${trips ? '<b>✓</b> parse(format(value)) round-trips' : '✗ does not round-trip'}</p>`;

  html += `<dl>${locales
    .filter((l) => l !== locale)
    .slice(0, 5)
    .map((l) => `<dt>${l}</dt><dd>${esc(tryFormat(entry.codec, result.value, l))}</dd>`)
    .join('')}</dl>`;

  // Under "any", the rest of the panel is about the codec that won.
  const leaf = entry.id === 'any' ? leafById[result.value.codec] : entry;
  const value = entry.id === 'any' ? result.value.value : result.value;

  if (leaf?.formatters) {
    html += `<p class="overline">formatters</p><dl>${leaf.formatters
      .map((f) => `<dt>${esc(f.call)}</dt><dd>${esc(tryFormat(f.codec, value, locale))}</dd>`)
      .join('')}</dl>`;
  }

  const units = (leaf?.codec as { units?: Record<string, unknown> } | undefined)?.units;
  if (leaf && units) {
    const q = value as Quantity;
    html += `<p class="overline"><code>convert(${leaf.id}(), value, unit)</code></p><dl>${Object.keys(units)
      .filter((u) => u !== q.unit)
      .map((u) => `<dt>${esc(u)}</dt><dd>${esc(tryFormat(leaf.codec, convert(leaf.codec as any, q, u), locale))}</dd>`)
      .join('')}</dl>`;
  }

  if (result.alternatives?.length) {
    html +=
      `<div class="alts"><p class="overline">alternatives</p><p>Other codecs that also parsed this. A UI can offer a choice instead of guessing.</p><dl>` +
      result.alternatives
        .map((a: any) => `<dt>${esc(a.codec)}</dt><dd>${esc(tryFormat(leafById[a.codec]!.codec, a.value, locale))}</dd>`)
        .join('') +
      `</dl></div>`;
  }
  $('right').innerHTML = html;
}

function renderCode(entry: Entry, text: string, result: ParseResult<any>): void {
  const lines = Object.entries(entry.imports).map(([from, names]) => `import { ${names.join(', ')} } from '${from}';`);
  lines.push('', `const codec = ${entry.call};`, `const result = codec.parse(${str(text)}, { locale: '${state.locale}' });`);
  if (result.ok && result.context.now) lines.push(`// no ctx.now, so this used the machine clock; result.context records it`);
  lines.push(`if (result.ok) save({ raw: ${str(text)}, value: result.value });`);
  $('code').textContent = lines.join('\n');
}

function render(): void {
  const entry = byId[state.id]!;
  const text = input.value;
  const result = entry.codec.parse(text, { locale: state.locale });
  $('parse-call').textContent = `codec.parse(${str(text)}, { locale: '${state.locale}' })`;
  $('result').innerHTML = pretty(result);
  renderRight(entry, result);
  renderCode(entry, text, result);

  const url = new URL(location.href);
  url.searchParams.set('codec', state.id);
  url.searchParams.set('q', text);
  if (state.locale === 'en-US') url.searchParams.delete('locale');
  else url.searchParams.set('locale', state.locale);
  history.replaceState(null, '', url);
}

function select(id: string): void {
  state.id = id;
  input.value = byId[id]!.examples[0]!;
  renderTabs();
  renderChips();
  render();
}

const localeSelect = $<HTMLSelectElement>('locale');
localeSelect.innerHTML = locales.map((l) => `<option${l === state.locale ? ' selected' : ''}>${l}</option>`).join('');
localeSelect.onchange = () => {
  state.locale = localeSelect.value;
  renderChips();
  render();
};
input.oninput = render;
$('tabs').onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.tab');
  if (b) select(b.dataset.id!);
};
$('tabs').onchange = (e) => {
  const v = (e.target as HTMLSelectElement).value;
  if (v) select(v);
};
$('chips').onclick = (e) => {
  const b = (e.target as HTMLElement).closest<HTMLElement>('.chip');
  if (!b) return;
  input.value = b.dataset.text!;
  render();
  input.focus();
};
document.addEventListener('keydown', (e) => {
  const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
  if (e.key === '/' && !typing) {
    e.preventDefault();
    input.select();
  }
  if ((e.key === '[' || e.key === ']') && !typing) {
    const ids = entries.map((x) => x.id);
    const i = ids.indexOf(state.id) + (e.key === ']' ? 1 : -1);
    select(ids[(i + ids.length) % ids.length]!);
  }
});

cycleOnClick($('mark-button'), $('mark'));
renderTabs();
renderChips();
render();
input.focus();
