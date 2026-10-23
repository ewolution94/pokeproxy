// The card catalogue: every card TCGSL lists, English and Japanese, searched in memory.
//
// TCGSL (tcgsl.ewolution.cloud, the family's set list) already keeps a daily snapshot of
// pokemontcg.io and TCGdex, and serves each card's picture resized and cached, 734 px wide at the
// largest: about 300 dpi on a 63 mm card. So PokeProxy asks no API of its own. It reads TCGSL's
// public snapshot (two indexes, one file per set, about 2 MB in all), keeps every card in memory
// (35,000 or so), and hands the page TCGSL's image addresses.
//
//   <tcgsl>/data/sets.json        the English sets
//   <tcgsl>/data/sets-ja.json     the Japanese sets (ids end in _ja; `pics` when they have pictures)
//   <tcgsl>/data/sets/<id>.json   one set's cards: [key, number, name, rarity, price]
//   <tcgsl>/img/card/<set>/<key>-240.webp      a thumbnail, for the search results
//   <tcgsl>/img/card-hd/<set>/<key>-734.webp   the picture that gets printed
//
// All or nothing: a load builds a whole new catalogue and swaps it in at the end, so a failed one
// keeps the last good copy.

import { withDeadline } from './deadline.mjs';

const UA = 'pokeproxy (ewolution.cloud)';

/** @typedef {{ id: string, set: string, key: string, number: string, name: string, rarity: string, price: number,
 *    lang: 'en' | 'ja', setName: string, setCode: string, series: string, date: string, printed: number,
 *    n: string, words: string[], setWords: string[], setN: string, codeN: string, keyN: string, numN: string }} Entry */

/** Lower case, accents and punctuation gone, full-width letters and hiragana folded into what the
 *  catalogue spells them with, so "flabebe", "ＦＬＡＢＥＢＥ" and "Flabébé" find the same card, and
 *  "りざーどん" finds リザードン. */
export function normalize(text) {
  return String(text)
    .normalize('NFKC')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .normalize('NFC')
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60))
    .replace(/[.'’`´]/g, '')
    .replace(/[^\p{L}\p{N}ー]+/gu, ' ')
    .trim();
}

/** A card number as the search compares it: no leading zeros, lower case ("006" → "6", "TG01" → "tg1"). */
export const numberKey = (n) => String(n).toLowerCase().replace(/^([a-z]*)0+(?=\d)/, '$1');

/** What a card number is printed as: "6/165" where it's a plain number, as it is otherwise ("TG01"). */
export function printedNumber(number, printed) {
  return /^\d+$/.test(number) && printed ? `${number}/${String(printed).padStart(number.length, '0')}` : number;
}

/**
 * Builds the entries from TCGSL's snapshot.
 * @param {{ sets: any[], lang: 'en' | 'ja' }[]} indexes
 * @param {Map<string, any[]>} cardsBySet  set id → TCGSL's card rows
 * @returns {Entry[]}
 */
export function buildEntries(indexes, cardsBySet) {
  const entries = [];
  for (const { sets, lang } of indexes) {
    for (const s of sets) {
      if (lang === 'ja' && !s.pics) continue;
      const rows = cardsBySet.get(s.id);
      if (!rows) continue;
      const setName = s.name ?? s.id;
      const setN = normalize(`${setName} ${s.ja ?? ''}`);
      for (const [key, number, name, rarity, price] of rows) {
        const n = normalize(name ?? '');
        entries.push({
          id: `${s.id}/${key}`,
          set: s.id,
          key,
          number,
          name: name ?? '',
          rarity: rarity ?? '',
          price: price ?? 0,
          lang,
          setName,
          setCode: s.code ?? '',
          series: s.series ?? '',
          date: s.date ?? '',
          printed: s.printed ?? 0,
          n,
          words: n.split(' ').filter(Boolean),
          setWords: setN.split(' ').filter(Boolean),
          setN: normalize(setName),
          codeN: normalize(s.code ?? ''),
          idN: s.id.toLowerCase().replace(/_ja$/, ''),
          keyN: numberKey(key),
          numN: numberKey(number),
        });
      }
    }
  }
  return entries;
}

const LANG_WORDS = { en: 'en', english: 'en', jp: 'ja', ja: 'ja', japanese: 'ja', jpn: 'ja' };

/** The words of a query: "6/165" becomes the number 6 of a set printed with 165. */
export function parseQuery(q) {
  const tokens = [];
  let lang = null;
  for (const raw of String(q).trim().split(/\s+/).filter(Boolean)) {
    const slash = /^#?([a-z]*\d+[a-z]*)\/(\d+)$/i.exec(raw);
    if (slash) {
      tokens.push({ text: numberKey(slash[1]), num: numberKey(slash[1]), printed: Number(slash[2]) });
      continue;
    }
    const lower = raw.toLowerCase();
    if (LANG_WORDS[lower]) {
      lang = LANG_WORDS[lower];
      continue;
    }
    const text = normalize(raw.replace(/^#/, ''));
    if (!text) continue;
    // A word like "6", "006", "tg01", "sv107" or "199a" may be a card number.
    const num = /^[a-z]{0,4}\d+[a-z]?$/.test(text) ? numberKey(text) : null;
    for (const part of text.split(' ')) tokens.push({ text: part, num: part === text ? num : null });
  }
  return { tokens, lang, whole: normalize(String(q).replace(/\b(en|english|jp|ja|japanese|jpn)\b/gi, '')) };
}

const CJK = /[぀-ヿ㐀-鿿]/;

/** How well one word of the query fits a card; 0 when it doesn't. */
function tokenScore(e, t) {
  let best = 0;
  const w = t.text;
  if (t.num != null && (e.keyN === t.num || e.numN === t.num)) best = 12 + (t.printed && t.printed === e.printed ? 6 : 0);
  if (t.printed) return best;
  if (e.words.includes(w)) best = Math.max(best, 25);
  else if (w.length >= 2 && e.words.some((x) => x.startsWith(w))) best = Math.max(best, 18);
  else if (CJK.test(w) && e.n.includes(w)) best = Math.max(best, 25);
  else if (w.length >= 3 && e.n.includes(w)) best = Math.max(best, 8);
  if (e.codeN === w || e.idN === w) best = Math.max(best, 16);
  if (e.setN === w) best = Math.max(best, 16);
  else if (e.setWords.includes(w)) best = Math.max(best, 10);
  else if (w.length >= 3 && e.setWords.some((x) => x.startsWith(w))) best = Math.max(best, 5);
  return best;
}

/**
 * Every word has to fit somewhere (the name, the set, the number). Best fit first, then the
 * newest set, then by number within a set.
 * @param {Entry[]} entries
 * @param {string} q
 * @param {{ lang?: 'en' | 'ja' | 'all', offset?: number, limit?: number }} [options]
 */
export function search(entries, q, { lang = 'all', offset = 0, limit = 48 } = {}) {
  const { tokens, lang: asked, whole } = parseQuery(q);
  const only = asked ?? (lang === 'all' ? null : lang);
  if (!tokens.length) return { total: 0, cards: [] };
  const hits = [];
  for (const e of entries) {
    if (only && e.lang !== only) continue;
    let score = 0;
    for (const t of tokens) {
      const s = tokenScore(e, t);
      if (!s) {
        score = 0;
        break;
      }
      score += s;
    }
    if (!score) continue;
    // The whole query is the card's name ("charizard ex"), or names the set ("151", "MEW").
    if (whole && e.n === whole) score += 5;
    if (whole && (e.setN === whole || e.codeN === whole || e.idN === whole)) score += 30;
    hits.push({ e, score });
  }
  hits.sort(
    (a, b) =>
      b.score - a.score ||
      b.e.date.localeCompare(a.e.date) ||
      (a.e.lang === b.e.lang ? 0 : a.e.lang === 'en' ? -1 : 1) ||
      a.e.set.localeCompare(b.e.set) ||
      a.e.key.localeCompare(b.e.key, 'en', { numeric: true }),
  );
  return { total: hits.length, cards: hits.slice(offset, offset + limit).map((h) => h.e) };
}

/**
 * The catalogue, loaded from TCGSL and refreshed on a timer.
 * @param {{ origin: string, images: string, refreshHours?: number, fetchJSON?: (url: string) => Promise<any>, log?: (msg: string) => void }} options
 *   origin  where the snapshot is read (TCGSL's address; on the NAS it can be the LAN one)
 *   images  where the page loads the pictures from (TCGSL's public address)
 */
export function createCatalog({ origin, images, refreshHours = 24, fetchJSON = getJSON, log = console.log }) {
  /** @type {Entry[] | null} */
  let entries = null;
  /** @type {Map<string, Entry>} */
  let byId = new Map();
  /** @type {Map<string, any>} */
  let sets = new Map();
  let built = '';
  let loading = null;
  let timer = null;

  const base = origin.replace(/\/$/, '');
  const pics = images.replace(/\/$/, '');

  async function load() {
    const [en, ja] = await Promise.all([fetchJSON(`${base}/data/sets.json`), fetchJSON(`${base}/data/sets-ja.json`)]);
    const stamp = `${en.built}|${ja.built}`;
    if (entries && stamp === built) return false;
    const wanted = [...en.sets, ...ja.sets.filter((s) => s.pics)];
    const cardsBySet = new Map();
    await pool(wanted, 6, async (s) => {
      const file = await fetchJSON(`${base}/data/sets/${s.id}.json`);
      cardsBySet.set(s.id, file.cards ?? []);
    });
    const next = buildEntries(
      [
        { sets: en.sets, lang: 'en' },
        { sets: ja.sets, lang: 'ja' },
      ],
      cardsBySet,
    );
    if (next.length < 1000) throw new Error(`only ${next.length} cards; keeping the last catalogue`);
    entries = next;
    byId = new Map(next.map((e) => [e.id, e]));
    sets = new Map([...en.sets.map((s) => [s.id, { ...s, lang: 'en' }]), ...ja.sets.map((s) => [s.id, { ...s, lang: 'ja' }])]);
    built = stamp;
    log(`Catalogue: ${next.length} cards in ${cardsBySet.size} sets (TCGSL ${en.built})`);
    return true;
  }

  /** Loads now, and again every `refreshHours`; a failure tries again sooner, backing off. */
  function start() {
    let failures = 0;
    const run = async () => {
      try {
        loading = load();
        await loading;
        failures = 0;
        schedule(refreshHours * 3600_000);
      } catch (err) {
        failures++;
        log(`Catalogue load failed (${failures}): ${err.message}`);
        schedule(Math.min(30 * 60_000, 15_000 * 2 ** Math.min(failures - 1, 7)));
      } finally {
        loading = null;
      }
    };
    const schedule = (ms) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
      timer.unref?.();
    };
    void run();
  }

  function stop() {
    clearTimeout(timer);
  }

  /** What the page gets for a card. */
  function view(e) {
    return {
      id: e.id,
      set: e.set,
      key: e.key,
      name: e.name,
      number: printedNumber(e.number, e.printed),
      rarity: e.rarity,
      lang: e.lang,
      setName: e.setName,
      setCode: e.setCode,
      year: e.date.slice(0, 4),
      thumb: `${pics}/img/card/${e.set}/${e.key}-240.webp`,
      image: `${pics}/img/card-hd/${e.set}/${e.key}-734.webp`,
    };
  }

  return {
    start,
    stop,
    /** Loads once, for tests and scripts. */
    load,
    get ready() {
      return entries !== null;
    },
    get size() {
      return entries?.length ?? 0;
    },
    search(q, options) {
      if (!entries) return null;
      const { total, cards } = search(entries, q, options);
      return { total, cards: cards.map(view) };
    },
    /** One card by its set and key (TCGSL's `sv3pt5` and `6`), or null. */
    card(set, key) {
      const e = byId.get(`${set}/${key}`);
      return e ? view(e) : null;
    },
    /** A card by its set's printed code and its number (Limitless's `MEW/6`, `jp/SV2a/6`). */
    byCode(lang, code, number) {
      if (!entries) return null;
      const c = normalize(code);
      const n = numberKey(number);
      const e = entries.find((x) => x.lang === lang && (x.codeN === c || x.idN === c) && (x.keyN === n || x.numN === n));
      return e ? view(e) : null;
    },
    /** A set by its id, for a link to a set page. */
    set(id) {
      const s = sets.get(id);
      return s ? { id: s.id, name: s.name, lang: s.lang } : null;
    },
  };
}

async function getJSON(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      return await withDeadline(20_000, async (signal) => {
        const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
      });
    } catch (err) {
      if (i >= tries - 1) throw new Error(`${url}: ${err.message}`, { cause: err });
      await new Promise((r) => setTimeout(r, 500 * 2 ** i));
    }
  }
}

async function pool(items, size, fn) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) await fn(items[next++]);
    }),
  );
}
