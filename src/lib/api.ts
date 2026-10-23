// The server's API (server/api.mjs): the catalogue's search and the link reader.

import { saveFile } from './files.svelte.ts';
import { uid, type Card } from './sheet.svelte.ts';

export interface CatalogCard {
  id: string;
  set: string;
  key: string;
  name: string;
  number: string;
  rarity: string;
  lang: 'en' | 'ja';
  setName: string;
  setCode: string;
  year: string;
  thumb: string;
  image: string;
}

export interface Results {
  total: number;
  cards: CatalogCard[];
  offset: number;
  limit: number;
}

export type Lang = 'all' | 'en' | 'ja';

/** Why something didn't work, in the words the page has for it (link.*, search.*). */
export class ApiError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

export async function searchCards(q: string, lang: Lang, offset: number, signal?: AbortSignal): Promise<Results> {
  const params = new URLSearchParams({ q, lang, offset: String(offset) });
  let res: Response;
  try {
    res = await fetch(`/api/search?${params}`, { signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('offline');
  }
  if (res.status === 503) throw new ApiError('loading');
  if (!res.ok) throw new ApiError('failed');
  return res.json();
}

/** A card's name; a Japanese card TCGdex lists without one goes by its set and number. */
export const nameOf = (c: CatalogCard) => c.name || `${c.setName} ${c.number}`;

export const metaOf = (c: CatalogCard) => [c.setName, c.number, c.year].filter(Boolean).join(' · ');

export function fromCatalog(c: CatalogCard): Card {
  return { uid: uid(), source: 'catalog', name: nameOf(c), meta: metaOf(c), image: c.image, thumb: c.thumb, ref: c.id, lang: c.lang, style: null };
}

export type LinkResult = { card: Card } | { set: { id: string; name: string; lang: 'en' | 'ja' } };

/** A pasted link: a card from the catalogue, a whole set, or the picture it shows (kept on the device). */
export async function readLink(url: string, signal?: AbortSignal): Promise<LinkResult> {
  let res: Response;
  try {
    res = await fetch('/api/link', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }), signal });
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err;
    throw new ApiError('offline');
  }
  const type = res.headers.get('content-type') ?? '';
  if (type.startsWith('application/json')) {
    const body = await res.json().catch(() => ({}));
    if (body.card) return { card: fromCatalog(body.card) };
    if (body.set) return { set: body.set };
    throw new ApiError(body.error ?? 'unreachable');
  }
  if (!res.ok || !type.startsWith('image/')) throw new ApiError('unreachable');
  const blob = await res.blob();
  const name = decodeURIComponent(res.headers.get('x-card-name') ?? '') || hostOf(url);
  const file = await saveFile(blob);
  return { card: { uid: uid(), source: 'link', name: tidy(name), meta: hostOf(url), file, link: url, style: null } };
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** Page titles carry the site's name: "Charizard ex · 151 (MEW) #006 ‹ PkmnCards" → "Charizard ex · 151 (MEW) #006". */
function tidy(title: string) {
  return title.replace(/\s*[|–—‹›«»]\s*[^|–—‹›«»]+$/, '').trim().slice(0, 80) || title.slice(0, 80);
}
