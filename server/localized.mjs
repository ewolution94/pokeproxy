// A card's picture in another language, for a card tagged with that language on the sheet.
//
// TCGdex (api.tcgdex.net, free, no key; TCGSL's source for the Japanese sets) has German, French,
// Italian, Spanish and Portuguese names and pictures for most sets since 2010/2011, French since
// Base Set, and part of the Traditional Chinese ones; Korean and Simplified Chinese hardly any
// (learnings/scraping-and-data.md). Its set ids aren't pokemontcg.io's (`sv03.5` for `sv3pt5`), so
// TCGSL's English sets are matched to TCGdex's by name, then by id. A set's cards in a language are
// fetched once and kept for a day; the pictures are TCGdex's 600 × 825 ones.

import { numberKey, normalize } from './catalog.mjs';
import { withDeadline } from './deadline.mjs';

const API = 'https://api.tcgdex.net/v2';
const UA = 'pokeproxy (ewolution.cloud)';
const DAY = 24 * 3600_000;

/** The sheet's language codes that TCGdex has pictures for, and TCGdex's code for each. */
export const LOCAL_LANGS = { de: 'de', fr: 'fr', it: 'it', es: 'es', pt: 'pt', 'zh-hant': 'zh-tw' };

/**
 * Matches TCGSL's English sets to TCGdex's: by name ("151" is `sv03.5` there), then by the same id
 * ("Base" is `base1` in both). Returns TCGSL id → TCGdex id.
 * @param {{ id: string, name: string }[]} ours
 * @param {{ id: string, name: string }[]} theirs
 */
export function matchSets(ours, theirs) {
  const byName = new Map(theirs.map((s) => [normalize(s.name), s.id]));
  const ids = new Set(theirs.map((s) => s.id));
  const out = new Map();
  for (const s of ours) {
    const id = byName.get(normalize(s.name)) ?? byName.get(normalize(s.name.replace(/^HS\W+/, ''))) ?? (ids.has(s.id) ? s.id : null);
    if (id) out.set(s.id, id);
  }
  return out;
}

/**
 * @param {{ catalog: { card(set: string, key: string): any, englishSets(): { id: string, name: string }[] }, fetchJSON?: (url: string) => Promise<any> }} options
 */
export function createLocalized({ catalog, fetchJSON = getJSON }) {
  let map = null;
  let mapAt = 0;
  let mapping = null;
  /** `${lang}/${tcgdexSet}` → { at, cards: Map(number → { name, image }) } */
  const sets = new Map();

  async function setMap() {
    if (map && Date.now() - mapAt < DAY) return map;
    mapping ??= (async () => {
      try {
        const theirs = await fetchJSON(`${API}/en/sets`);
        map = matchSets(catalog.englishSets(), theirs);
        mapAt = Date.now();
      } finally {
        mapping = null;
      }
      return map;
    })();
    return mapping;
  }

  async function setCards(lang, set) {
    const key = `${lang}/${set}`;
    const hit = sets.get(key);
    if (hit && Date.now() - hit.at < DAY) return hit.cards;
    let data = null;
    try {
      data = await fetchJSON(`${API}/${LOCAL_LANGS[lang]}/sets/${encodeURIComponent(set)}`);
    } catch {
      // Not in that language (a 404) or TCGdex is down: no pictures, asked again tomorrow.
    }
    const cards = new Map(
      (data?.cards ?? []).filter((c) => c.image && c.localId).map((c) => [numberKey(c.localId), { name: c.name ?? '', image: `${c.image}/high.webp` }]),
    );
    sets.set(key, { at: Date.now(), cards });
    if (sets.size > 400) sets.delete(sets.keys().next().value);
    return cards;
  }

  return {
    /**
     * The card `ref` (TCGSL's `sv3pt5/6`) in `lang`, or null when TCGdex has no picture of it.
     * @returns {Promise<{ name: string, image: string } | null>}
     */
    async find(ref, lang) {
      if (!Object.hasOwn(LOCAL_LANGS, lang)) return null;
      const [set, key] = String(ref).split('/');
      const card = set && key ? catalog.card(set, key) : null;
      if (!card || card.lang !== 'en') return null;
      const theirs = (await setMap()).get(set);
      if (!theirs) return null;
      return (await setCards(lang, theirs)).get(numberKey(key)) ?? null;
    },
  };
}

async function getJSON(url) {
  return withDeadline(15_000, async (signal) => {
    const res = await fetch(url, { headers: { 'user-agent': UA, accept: 'application/json' }, signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  });
}
