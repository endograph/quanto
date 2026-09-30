// A stand-in for quanto's built-in codecs, for the site mock only.
// It follows DESIGN.md closely enough to demo (value shapes, issue codes,
// locale number rules, merge, implicits) but it is not the library.
// Classic script so the pages also open straight from disk.
(function () {
  const LOCALES = {
    'en-US': { dec: '.', grp: ',', dateOrder: 'mdy', currency: 'USD', dateStyle: 'us', symbolAfter: false },
    'en-GB': { dec: '.', grp: ',', dateOrder: 'dmy', currency: 'GBP', dateStyle: 'gb', symbolAfter: false },
    'en-CA': { dec: '.', grp: ',', dateOrder: 'mdy', currency: 'CAD', dateStyle: 'us', symbolAfter: false },
    'de-DE': { dec: ',', grp: '.', dateOrder: 'dmy', currency: 'EUR', dateStyle: 'de', symbolAfter: true },
  };
  const loc = (ctx) => LOCALES[(ctx && ctx.locale) || 'en-US'] || LOCALES['en-US'];

  const fail = (code, message) => ({ ok: false, issues: [{ code, message }] });

  // Smart quotes, primes and odd spaces, as DESIGN.md's normalization step describes.
  function normalize(text) {
    return String(text)
      .replace(/[’‘`´′]/g, "'")
      .replace(/[“”″]/g, '"')
      .replace(/[   ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const UNICODE_FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };

  // Returns { n, dp } (dp = digits after the decimal separator) or null.
  function parseNumber(raw, L) {
    let s = raw;
    let sign = 1;
    if (s[0] === '-' || s[0] === '+') { sign = s[0] === '-' ? -1 : 1; s = s.slice(1); }
    let extra = 0;
    const last = s.slice(-1);
    if (last in UNICODE_FRACTIONS) {
      extra = UNICODE_FRACTIONS[last];
      s = s.slice(0, -1);
      if (!s) return { n: sign * extra, dp: 0 };
    }
    if (/^\d+\/\d+$/.test(s)) {
      const [a, b] = s.split('/').map(Number);
      return b ? { n: sign * (a / b), dp: 0 } : null;
    }
    const commas = (s.match(/,/g) || []).length;
    const dots = (s.match(/\./g) || []).length;
    let dec = null;
    let grp = null;
    if (commas && dots) {
      // Both present: the last one is the decimal separator.
      dec = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
      grp = dec === ',' ? '.' : ',';
      if ((dec === ',' ? commas : dots) > 1) return null;
    } else if (commas || dots) {
      const sep = commas ? ',' : '.';
      if (commas + dots > 1) grp = sep;
      else {
        const after = s.length - s.indexOf(sep) - 1;
        // Exactly three digits is ambiguous and the locale decides; anything else is a decimal.
        if (after === 3) { if (sep === L.dec) dec = sep; else grp = sep; }
        else dec = sep;
      }
    }
    let [int, frac = ''] = dec ? s.split(dec) : [s];
    if (grp) {
      const groups = int.split(grp);
      if (!groups[0] || groups[0].length > 3 || groups.slice(1).some((g) => g.length !== 3)) return null;
      int = groups.join('');
    }
    if (!/^\d*$/.test(int) || !/^\d*$/.test(frac) || (!int && !frac)) return null;
    return { n: sign * (Number(`${int || '0'}.${frac || '0'}`) + extra), dp: frac.length };
  }

  function formatNumber(n, L, maxDp, fixed) {
    let str = Math.abs(n).toFixed(maxDp);
    if (!fixed && str.includes('.')) str = str.replace(/0+$/, '').replace(/\.$/, '');
    let [int, frac] = str.split('.');
    int = int.replace(/\B(?=(\d{3})+(?!\d))/g, L.grp);
    const neg = n < 0 && Number(str) !== 0;
    return (neg ? '-' : '') + int + (frac ? L.dec + frac : '');
  }

  const clean = (x) => Number(x.toPrecision(12));

  // ── Quantities ────────────────────────────────────────────────────────

  const NUM = /^[+-]?(?:\d[\d.,]*(?:\/\d+)?[½¼¾⅓⅔⅛]?|[½¼¾⅓⅔⅛]|[.,]\d+)/;

  function quantity({ id, units, noun }) {
    const aliases = [];
    for (const [unit, def] of Object.entries(units)) {
      for (const a of def.aliases) aliases.push([a.toLowerCase(), unit]);
    }
    aliases.sort((a, b) => b[0].length - a[0].length);
    const affine = (u) => typeof units[u].toBase !== 'number';
    const toBase = (v, u) => {
      const t = units[u].toBase;
      return typeof t === 'number' ? v * t : v * t.factor + t.offset;
    };
    const fromBase = (b, u) => {
      const t = units[u].toBase;
      return typeof t === 'number' ? b / t : (b - t.offset) / t.factor;
    };
    const scale = (u) => (affine(u) ? units[u].toBase.factor : units[u].toBase);

    function parse(text, ctx) {
      const L = loc(ctx);
      const s = normalize(text);
      if (!s) return fail('empty', 'Input is empty.');
      const lower = s.toLowerCase();
      const parts = [];
      let i = 0;
      while (i < s.length) {
        const m = s.slice(i).match(NUM);
        if (!m) return fail('unparseable', `Couldn't read “${s}” as a ${noun}.`);
        const num = parseNumber(m[0], L);
        if (!num) return fail('unparseable', `“${m[0]}” isn't a number.`);
        i += m[0].length;
        while (s[i] === ' ') i++;
        let unit = null;
        for (const [a, u] of aliases) {
          if (lower.startsWith(a, i) && !/[a-zµ]/.test(lower[i + a.length] || '')) {
            unit = u;
            i += a.length;
            break;
          }
        }
        if (!unit) {
          const word = lower.slice(i).match(/^(?:[a-zµ°]+|['"])/);
          if (word) return fail('unknown_unit', `“${word[0]}” isn't a unit this ${noun} codec knows.`);
        }
        parts.push({ n: num.n, unit });
        const sep = s.slice(i).match(/^[\s,]*(?:and\s+)?/i);
        i += sep[0].length;
      }
      if (parts.length === 1 && !parts[0].unit) {
        return fail('missing_unit', 'A bare number needs a unit, and this codec has no defaultUnit.');
      }
      if (parts.some((p) => !p.unit)) return fail('unparseable', 'Every part of a compound value needs a unit.');
      if (parts.length === 1) return { ok: true, value: { value: parts[0].n, unit: parts[0].unit } };
      if (parts.some((p) => affine(p.unit))) {
        return fail('unparseable', `A ${noun} can't be written as a sum of parts.`);
      }
      // Compound input is summed into the smallest unit mentioned.
      const smallest = parts.reduce((a, p) => (scale(p.unit) < scale(a) ? p.unit : a), parts[0].unit);
      const base = parts.reduce((sum, p) => sum + toBase(p.n, p.unit), 0);
      return { ok: true, value: { value: clean(fromBase(base, smallest)), unit: smallest } };
    }

    const format = (q, ctx) => `${formatNumber(q.value, loc(ctx), 4)} ${units[q.unit].aliases[0]}`;
    const convert = (q, unit) => ({ value: clean(fromBase(toBase(q.value, q.unit), unit)), unit });
    const equal = (a, b) => a.unit === b.unit && Math.abs(a.value - b.value) <= 5e-5 + 1e-9 * Math.abs(a.value);

    return { id, kind: 'quantity', units, parse, format, convert, equal, call: `${id}()` };
  }

  const length = quantity({
    id: 'length',
    noun: 'length',
    units: {
      mm: { toBase: 0.001, aliases: ['mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'] },
      cm: { toBase: 0.01, aliases: ['cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'] },
      m: { toBase: 1, aliases: ['m', 'meter', 'meters', 'metre', 'metres'] },
      km: { toBase: 1000, aliases: ['km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'] },
      in: { toBase: 0.0254, aliases: ['in', 'inch', 'inches', '"'] },
      ft: { toBase: 0.3048, aliases: ['ft', 'foot', 'feet', "'"] },
      yd: { toBase: 0.9144, aliases: ['yd', 'yard', 'yards'] },
      mi: { toBase: 1609.344, aliases: ['mi', 'mile', 'miles'] },
    },
  });

  const mass = quantity({
    id: 'mass',
    noun: 'mass',
    units: {
      mg: { toBase: 0.001, aliases: ['mg', 'milligram', 'milligrams'] },
      g: { toBase: 1, aliases: ['g', 'gram', 'grams', 'gramme', 'grammes'] },
      kg: { toBase: 1000, aliases: ['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'] },
      oz: { toBase: 28.349523125, aliases: ['oz', 'ounce', 'ounces'] },
      lb: { toBase: 453.59237, aliases: ['lb', 'lbs', 'pound', 'pounds'] },
      st: { toBase: 6350.29318, aliases: ['st', 'stone', 'stones'] },
    },
  });

  const duration = quantity({
    id: 'duration',
    noun: 'duration',
    units: {
      ms: { toBase: 0.001, aliases: ['ms', 'millisecond', 'milliseconds'] },
      s: { toBase: 1, aliases: ['s', 'sec', 'secs', 'second', 'seconds'] },
      min: { toBase: 60, aliases: ['min', 'mins', 'minute', 'minutes', 'm'] },
      h: { toBase: 3600, aliases: ['h', 'hr', 'hrs', 'hour', 'hours'] },
      d: { toBase: 86400, aliases: ['d', 'day', 'days'] },
      wk: { toBase: 604800, aliases: ['wk', 'wks', 'week', 'weeks', 'w'] },
    },
  });

  const temperature = quantity({
    id: 'temperature',
    noun: 'temperature',
    units: {
      C: { toBase: { factor: 1, offset: 0 }, aliases: ['°C', 'c', 'celsius', 'degc'] },
      F: { toBase: { factor: 5 / 9, offset: -160 / 9 }, aliases: ['°F', 'f', 'fahrenheit', 'degf'] },
      K: { toBase: { factor: 1, offset: -273.15 }, aliases: ['K', 'kelvin'] },
    },
  });

  // ── Money ─────────────────────────────────────────────────────────────

  const MINOR = { USD: 2, EUR: 2, GBP: 2, JPY: 0, CAD: 2, CHF: 2, AUD: 2, MXN: 2, BHD: 3 };
  const SYMBOLS = { '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
  const DOLLARS = ['USD', 'CAD', 'AUD', 'MXN'];
  const SUFFIX = { k: 1e3, m: 1e6, b: 1e9 };

  const resolveSymbol = (sym, L) => {
    if (sym !== '$') return SYMBOLS[sym];
    return DOLLARS.includes(L.currency) ? L.currency : 'USD';
  };
  const symbolFor = (currency, L) => {
    if (currency in MINOR && resolveSymbol('$', L) === currency) return '$';
    return Object.keys(SYMBOLS).find((s) => SYMBOLS[s] === currency);
  };

  const MONEY = /^([+-])?\s*([$€£¥]|[a-z]{3}(?=[\s\d]))?\s*([+-])?\s*(\d[\d.,]*|[.,]\d+)\s*([kmb])?\s*([$€£¥]|[a-z]{3})?$/i;

  const money = {
    id: 'money',
    kind: 'money',
    call: 'money()',
    parse(text, ctx) {
      const L = loc(ctx);
      const s = normalize(text);
      if (!s) return fail('empty', 'Input is empty.');
      const m = s.match(MONEY);
      if (!m) return fail('unparseable', `Couldn't read “${s}” as money.`);
      const [, sign1, pre, sign2, digits, suffix, post] = m;
      if (pre && post) return fail('unparseable', 'Give the currency once, before or after the amount.');
      const mark = pre || post;
      if (!mark) return fail('unknown_currency', 'No currency given, and this codec has no defaultCurrency.');
      const currency = mark.length === 1 ? resolveSymbol(mark, L) : mark.toUpperCase();
      if (!(currency in MINOR)) return fail('unknown_currency', `“${mark}” isn't a currency quanto knows.`);
      const num = parseNumber(digits, L);
      if (!num) return fail('unparseable', `“${digits}” isn't a number.`);
      const places = MINOR[currency];
      const minor = num.n * (suffix ? SUFFIX[suffix.toLowerCase()] : 1) * 10 ** places;
      if (Math.abs(minor - Math.round(minor)) > 1e-6) {
        return fail('excess_precision', `${currency} has ${places} decimal place${places === 1 ? '' : 's'}; “${s}” has more.`);
      }
      const neg = (sign1 === '-') !== (sign2 === '-');
      return { ok: true, value: { minorUnits: (neg ? -1 : 1) * Math.round(minor), currency } };
    },
    format(v, ctx) {
      const L = loc(ctx);
      const places = MINOR[v.currency] ?? 2;
      const amount = formatNumber(Math.abs(v.minorUnits) / 10 ** places, L, places, true);
      const sign = v.minorUnits < 0 ? '-' : '';
      const sym = symbolFor(v.currency, L);
      if (!sym) return `${sign}${amount} ${v.currency}`;
      return L.symbolAfter ? `${sign}${amount} ${sym}` : `${sign}${sym}${amount}`;
    },
    equal: (a, b) => a.minorUnits === b.minorUnits && a.currency === b.currency,
  };

  // ── Dates ─────────────────────────────────────────────────────────────

  const MONTHS = {
    jan: 1, feb: 2, mar: 3, mär: 3, apr: 4, may: 5, mai: 5, jun: 6, jul: 7,
    aug: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, dez: 12,
  };
  const EN_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DE_MON = ['Jan.', 'Feb.', 'März', 'Apr.', 'Mai', 'Juni', 'Juli', 'Aug.', 'Sept.', 'Okt.', 'Nov.', 'Dez.'];
  const WEEKDAYS = {
    sun: 0, sunday: 0, so: 0, sonntag: 0,
    mon: 1, monday: 1, mo: 1, montag: 1,
    tue: 2, tues: 2, tuesday: 2, di: 2, dienstag: 2,
    wed: 3, wednesday: 3, mi: 3, mittwoch: 3,
    thu: 4, thur: 4, thurs: 4, thursday: 4, do: 4, donnerstag: 4,
    fri: 5, friday: 5, fr: 5, freitag: 5,
    sat: 6, saturday: 6, sa: 6, samstag: 6,
  };

  const pad = (n, w = 2) => String(Math.abs(n)).padStart(w, '0');
  const iso = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
  const daysIn = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
  const addDays = ({ y, m, d }, n) => {
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  };

  function machineNow() {
    const t = new Date();
    const off = -t.getTimezoneOffset();
    const stamp =
      `${iso(t.getFullYear(), t.getMonth() + 1, t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}` +
      `${off >= 0 ? '+' : '-'}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
    return { stamp, y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }
  function nowFrom(ctx) {
    if (!(ctx && ctx.now)) return machineNow();
    const [y, m, d] = ctx.now.slice(0, 10).split('-').map(Number);
    return { stamp: ctx.now, y, m, d };
  }

  const date = {
    id: 'date',
    kind: 'date',
    call: 'date()',
    parse(text, ctx) {
      const L = loc(ctx);
      const s = normalize(text).toLowerCase();
      if (!s) return fail('empty', 'Input is empty.');
      const now = nowFrom(ctx);
      const ok = (v, usedNow) => {
        const r = { ok: true, value: iso(v.y, v.m, v.d) };
        if (usedNow && !(ctx && ctx.now)) r.implicits = { now: now.stamp };
        return r;
      };
      const valid = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d <= daysIn(y, m);
      const bad = () => fail('unparseable', `Couldn't read “${normalize(text)}” as a date.`);

      const rel = { today: 0, heute: 0, tomorrow: 1, morgen: 1, yesterday: -1, gestern: -1 };
      if (s in rel) return ok(addDays(now, rel[s]), true);
      let m;
      if ((m = s.match(/^in (\d+) (day|days|week|weeks)$/))) {
        return ok(addDays(now, Number(m[1]) * (m[2].startsWith('week') ? 7 : 1)), true);
      }
      if ((m = s.match(/^(\d+) (day|days|week|weeks) ago$/))) {
        return ok(addDays(now, -Number(m[1]) * (m[2].startsWith('week') ? 7 : 1)), true);
      }
      if ((m = s.match(/^(next )?([a-z]+)$/)) && m[2] in WEEKDAYS) {
        const today = new Date(Date.UTC(now.y, now.m - 1, now.d)).getUTCDay();
        let ahead = (WEEKDAYS[m[2]] - today + 7) % 7;
        if (m[1] && ahead === 0) ahead = 7;
        return ok(addDays(now, ahead), true);
      }
      if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        const [y, mo, d] = m.slice(1).map(Number);
        return valid(y, mo, d) ? ok({ y, m: mo, d }, false) : bad();
      }
      if ((m = s.match(/^(\d{1,2})[./](\d{1,2})(?:[./](\d{2}|\d{4}))?\.?$/))) {
        const a = Number(m[1]);
        const b = Number(m[2]);
        // Numeric order follows the locale, unless one side can only be a day.
        const mdy = L.dateOrder === 'mdy' ? a <= 12 || b > 12 : b > 12 && a <= 12;
        const [mo, d] = mdy ? [a, b] : [b, a];
        const y = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : now.y;
        return valid(y, mo, d) ? ok({ y, m: mo, d }, !m[3]) : bad();
      }
      const tokens = s.split(/[\s,.]+/).filter(Boolean);
      let mo;
      let y;
      let d;
      for (const t of tokens) {
        const key = t.slice(0, 3);
        if (/^[a-zä]+$/.test(t) && key in MONTHS && mo === undefined) mo = MONTHS[key];
        else if (/^\d{4}$/.test(t) && y === undefined) y = Number(t);
        else if (/^\d{1,2}(st|nd|rd|th)?$/.test(t) && d === undefined) d = parseInt(t, 10);
        else return bad();
      }
      if (mo === undefined || d === undefined) return bad();
      const year = y ?? now.y;
      return valid(year, mo, d) ? ok({ y: year, m: mo, d }, y === undefined) : bad();
    },
    format(v, ctx) {
      const L = loc(ctx);
      const [y, m, d] = v.split('-').map(Number);
      if (L.dateStyle === 'de') return `${d}. ${DE_MON[m - 1]} ${y}`;
      if (L.dateStyle === 'gb') return `${d} ${EN_MON[m - 1]} ${y}`;
      return `${EN_MON[m - 1]} ${d}, ${y}`;
    },
    equal: (a, b) => a === b,
  };

  // ── merge() ───────────────────────────────────────────────────────────

  function merge(list) {
    const byId = Object.fromEntries(list.map((c) => [c.id, c]));
    return {
      id: 'merge',
      call: `merge([${list.map((c) => c.call).join(', ')}])`,
      parse(text, ctx) {
        const wins = [];
        const issues = [];
        for (const c of list) {
          const r = c.parse(text, ctx);
          if (r.ok) wins.push({ codec: c.id, r });
          else issues.push(...r.issues.map((i) => ({ ...i, codec: c.id })));
        }
        if (!wins.length) return { ok: false, issues };
        const [first, ...rest] = wins;
        const res = { ok: true, value: { codec: first.codec, value: first.r.value } };
        if (first.r.implicits) res.implicits = first.r.implicits;
        if (rest.length) res.alternatives = rest.map((w) => ({ codec: w.codec, value: w.r.value }));
        return res;
      },
      format: (t, ctx) => byId[t.codec].format(t.value, ctx),
      equal: (a, b) => a.codec === b.codec && byId[a.codec].equal(a.value, b.value),
      inner: byId,
    };
  }

  const codecs = { length, mass, duration, temperature, money, date };
  codecs.merge = merge([length, mass, duration, temperature, money, date]);

  window.quantoMock = { codecs, locales: Object.keys(LOCALES) };
})();
