// The sheet: its setup (paper, card size, cut marks, print style) and its slots, one after the
// other across every page. Pages are only a way of cutting the slots into what fits one paper,
// so changing the paper or the card size flows the cards onto the new pages in the same order.
// Everything is kept on this device (localStorage; uploaded pictures in IndexedDB, files.svelte.ts).

import { DEFAULT_SETUP, PAPERS, cleanLabel, clampSize, layout, locate, padToPages, trimPages, type Label, type PrintStyle, type Setup } from './layout.ts';

export interface Card {
  uid: string;
  source: 'catalog' | 'link' | 'file';
  name: string;
  /** What the card is, after its name: "151 · 6/165 · 2023". */
  meta: string;
  /** The picture to print: TCGSL's for a catalogue card. */
  image?: string;
  /** A smaller one for the panel. */
  thumb?: string;
  /** For a link or an upload: the picture's key in IndexedDB. */
  file?: string;
  /** The catalogue's id (`sv3pt5/6`), so a card from search can be found again. */
  ref?: string;
  lang?: 'en' | 'ja';
  /** Where a link card came from. */
  link?: string;
  /** This card's own print style; the sheet's when null. */
  style?: PrintStyle | null;
  /** The language the proxy stands for, printed on it as a badge (languages.ts). */
  tag?: string | null;
  /** A few words printed after the language: "1st Edition", "Shadowless". */
  note?: string;
  /** The card's picture in the tagged language, where TCGdex has one (server/localized.mjs). */
  local?: { lang: string; name: string; image: string } | null;
  /** Show the catalogue's picture even though a localized one exists. */
  original?: boolean;
  /** This card's own label look; the sheet's (setup.label) when absent. */
  label?: Label | null;
}

/** The picture a card shows and prints (an uploaded or fetched one comes from files.svelte.ts). */
export const pictureOf = (c: Card) => (c.local && c.local.lang === c.tag && !c.original ? c.local.image : c.image);

const KEY = 'pokeproxy:sheet';
/** The note's length: it shares the badge with the language. */
export const NOTE_MAX = 40;
const STYLES: PrintStyle[] = ['colour', 'grey', 'light'];

export const uid = () => (crypto.randomUUID?.() ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`);

function cleanSetup(raw: any): Setup {
  const s = { ...DEFAULT_SETUP, ...(raw && typeof raw === 'object' ? raw : {}) };
  return {
    paper: s.paper in PAPERS ? s.paper : DEFAULT_SETUP.paper,
    landscape: !!s.landscape,
    custom: !!s.custom,
    w: clampSize(Number(s.w)),
    h: clampSize(Number(s.h)),
    gap: Math.max(0, Math.min(10, Number(s.gap) || 0)),
    marks: s.marks !== false,
    ruler: s.ruler !== false,
    style: STYLES.includes(s.style) ? s.style : DEFAULT_SETUP.style,
    label: cleanLabel(s.label),
  };
}

function cleanCard(raw: any): Card | null {
  if (!raw || typeof raw !== 'object' || typeof raw.name !== 'string') return null;
  if (!raw.image && !raw.file) return null;
  return {
    uid: typeof raw.uid === 'string' ? raw.uid : uid(),
    source: raw.source === 'link' || raw.source === 'file' ? raw.source : 'catalog',
    name: raw.name,
    meta: typeof raw.meta === 'string' ? raw.meta : '',
    image: typeof raw.image === 'string' ? raw.image : undefined,
    thumb: typeof raw.thumb === 'string' ? raw.thumb : undefined,
    file: typeof raw.file === 'string' ? raw.file : undefined,
    ref: typeof raw.ref === 'string' ? raw.ref : undefined,
    lang: raw.lang === 'ja' ? 'ja' : raw.lang === 'en' ? 'en' : undefined,
    link: typeof raw.link === 'string' ? raw.link : undefined,
    style: STYLES.includes(raw.style) ? raw.style : null,
    tag: typeof raw.tag === 'string' ? raw.tag.slice(0, 10) : null,
    note: typeof raw.note === 'string' ? raw.note.slice(0, NOTE_MAX) : '',
    local:
      raw.local && typeof raw.local.image === 'string' && /^https:\/\/assets\.tcgdex\.net\//.test(raw.local.image)
        ? { lang: String(raw.local.lang), name: String(raw.local.name ?? ''), image: raw.local.image }
        : null,
    original: !!raw.original,
    label: raw.label ? cleanLabel(raw.label) : null,
  };
}

function load(): { setup: Setup; slots: (Card | null)[] } {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (saved && Array.isArray(saved.slots)) return { setup: cleanSetup(saved.setup), slots: saved.slots.slice(0, 2000).map(cleanCard) };
  } catch {}
  return { setup: { ...DEFAULT_SETUP }, slots: [] };
}

class Sheet {
  setup = $state<Setup>(DEFAULT_SETUP);
  /** Every slot, page after page; null is an empty one. Always whole pages. */
  slots = $state<(Card | null)[]>([]);
  /** The slot the next card goes into. */
  selected = $state<number | null>(0);
  /** The last change that removed something, for Undo. */
  #undo: (Card | null)[] | null = null;
  /** The last placing: the slot its first card went into, and a counter that tells two apart. */
  placed = $state<{ at: number; n: number } | null>(null);
  /** A slot to light up for a moment (a card just placed from the phone's card sheet). */
  flash = $state<number | null>(null);

  geometry = $derived(layout(this.setup));
  pageCount = $derived(this.geometry.perPage ? Math.ceil(this.slots.length / this.geometry.perPage) : 0);
  cardCount = $derived(this.slots.filter(Boolean).length);

  constructor() {
    const saved = load();
    this.setup = saved.setup;
    this.slots = trimPages(saved.slots, layout(saved.setup).perPage);
    this.selected = this.firstEmpty(0);
  }

  /** The slots of page `p`. */
  page(p: number) {
    const n = this.geometry.perPage;
    return this.slots.slice(p * n, p * n + n);
  }

  where(index: number) {
    return locate(index, this.geometry.perPage);
  }

  /** The first empty slot from `from` on, or null when every page is full. */
  firstEmpty(from = 0): number | null {
    for (let i = Math.max(0, from); i < this.slots.length; i++) if (!this.slots[i]) return i;
    return null;
  }

  /** Changes the setup; the cards flow onto the pages it gives. */
  change(patch: Partial<Setup>) {
    const selectedCard = this.selected != null ? this.slots[this.selected] : null;
    this.setup = cleanSetup({ ...this.setup, ...patch });
    const n = layout(this.setup).perPage;
    this.slots = trimPages(this.slots, n);
    if (selectedCard) this.selected = this.slots.indexOf(selectedCard);
    if (this.selected != null && this.selected >= this.slots.length) this.selected = this.firstEmpty(0) ?? this.slots.length - 1;
  }

  select(index: number | null) {
    this.selected = index == null ? null : Math.max(0, Math.min(this.slots.length - 1, index));
  }

  /** Room for one more page's worth at the end; returns its first slot. */
  addPage(): number {
    const start = this.slots.length;
    this.slots = padToPages([...this.slots, null], this.geometry.perPage);
    return start;
  }

  removePage(p: number) {
    const n = this.geometry.perPage;
    this.#remember();
    const next = this.slots.slice();
    next.splice(p * n, n);
    this.slots = padToPages(next, n);
    if (this.selected != null && this.selected >= this.slots.length) this.selected = this.slots.length - 1;
  }

  /**
   * Puts cards in, starting at `at` (the selected slot unless said otherwise): the first takes
   * that slot whatever is in it, the rest take the empty slots after it, with new pages as
   * needed. The selection moves on to the next empty slot.
   */
  place(cards: Card[], at: number | null = this.selected) {
    if (!cards.length || !this.geometry.perPage) return;
    let next = this.slots.slice();
    let i = at ?? this.firstEmpty(0) ?? next.length;
    const put: number[] = [];
    for (const [k, card] of cards.entries()) {
      if (k > 0) {
        while (i < next.length && next[i]) i++;
      }
      if (i >= next.length) next = padToPages([...next, null], this.geometry.perPage);
      next[i] = card;
      put.push(i);
      i++;
    }
    this.slots = next;
    this.placed = { at: put[0], n: (this.placed?.n ?? 0) + 1 };
    let after = this.firstEmpty(put[put.length - 1] + 1);
    if (after == null) {
      after = this.firstEmpty(0);
      // Every page is full: the next card starts a new one.
      if (after == null) after = this.addPage();
    }
    this.selected = after;
  }

  remove(index: number) {
    if (!this.slots[index]) return;
    this.#remember();
    const next = this.slots.slice();
    next[index] = null;
    this.slots = next;
    this.selected = index;
  }

  /** Swaps two slots (a card dragged onto another, or onto an empty slot). */
  move(from: number, to: number) {
    if (from === to) return;
    const next = this.slots.slice();
    [next[from], next[to]] = [next[to], next[from]];
    this.slots = next;
    this.selected = to;
  }

  /** Puts the same card in the next empty slot too. */
  duplicate(index: number) {
    const card = this.slots[index];
    if (!card) return;
    this.place([{ ...card, uid: uid() }], this.firstEmpty(index + 1) ?? this.firstEmpty(0));
  }

  setStyle(index: number, style: PrintStyle | null) {
    this.update(index, { style });
  }

  /** Changes one card. */
  update(index: number, patch: Partial<Card>) {
    const card = this.slots[index];
    if (!card) return;
    const next = this.slots.slice();
    next[index] = { ...card, ...patch };
    this.slots = next;
  }

  /** Changes the card with this uid wherever it is now (an answer arriving after a move). */
  updateCard(uid: string, patch: Partial<Card>) {
    const index = this.slots.findIndex((c) => c?.uid === uid);
    if (index >= 0) this.update(index, patch);
  }

  /** The same card again in each language, in the empty slots after it. Returns the new cards. */
  inLanguages(index: number, tags: string[]): Card[] {
    const card = this.slots[index];
    if (!card || !tags.length) return [];
    const copies = tags.map((tag) => ({ ...card, uid: uid(), tag, local: null, original: false }));
    this.place(copies, this.firstEmpty(index + 1) ?? this.firstEmpty(0));
    this.selected = index;
    return copies;
  }

  clear() {
    this.#remember();
    this.slots = padToPages([], this.geometry.perPage);
    this.selected = 0;
  }

  get canUndo() {
    return this.#undo !== null;
  }

  undo() {
    if (!this.#undo) return;
    this.slots = padToPages(this.#undo, this.geometry.perPage);
    this.#undo = null;
  }

  #remember() {
    this.#undo = this.slots.slice();
  }

  /** The look a card's label is drawn in: its own, or the sheet's. */
  labelOf(card: Card): Label {
    return card.label ?? this.setup.label;
  }

  /**
   * Changes a card's label look: the card's own when it has one, otherwise every label's (the sheet's
   * look, which every card without its own follows).
   */
  setLabel(index: number, patch: Partial<Label>) {
    const card = this.slots[index];
    if (!card) return;
    if (card.label) this.update(index, { label: cleanLabel({ ...card.label, ...patch }) });
    else this.setSheetLabel(patch);
  }

  /** Changes the sheet's label look, which every card without its own follows. */
  setSheetLabel(patch: Partial<Label>) {
    this.setup = { ...this.setup, label: cleanLabel({ ...this.setup.label, ...patch }) };
  }

  /** Gives a card a look of its own (a copy of what it shows now), or returns it to the sheet's. */
  ownLabel(index: number, own: boolean) {
    const card = this.slots[index];
    if (!card) return;
    this.update(index, { label: own ? { ...this.labelOf(card) } : null });
  }

  /** The print style a card is printed in. */
  styleOf(card: Card): PrintStyle {
    return card.style ?? this.setup.style;
  }

  /** Every picture key still in use, so the rest can be cleared from IndexedDB. */
  files(): Set<string> {
    const keys = new Set<string>();
    for (const c of this.slots) if (c?.file) keys.add(c.file);
    for (const c of this.#undo ?? []) if (c?.file) keys.add(c.file);
    return keys;
  }
}

export const sheet = new Sheet();

$effect.root(() => {
  $effect(() => {
    const snapshot = JSON.stringify({ setup: sheet.setup, slots: sheet.slots });
    try {
      localStorage.setItem(KEY, snapshot);
    } catch {}
  });
});
