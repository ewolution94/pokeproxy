// A tagged card's picture in its language (server/localized.mjs): asked for when the tag changes,
// kept on the card, shown unless the card is set to keep its original picture.

import { language } from './languages.ts';
import { sheet, type Card } from './sheet.svelte.ts';

/** Looks the card's picture up in its tag's language; the answer lands on the card wherever it is by then. */
export async function localize(card: Card) {
  const tag = card.tag;
  if (card.source !== 'catalog' || !card.ref || !tag || !language(tag)?.local) return;
  if (card.local?.lang === tag) return;
  try {
    const res = await fetch(`/api/local?${new URLSearchParams({ ref: card.ref, lang: tag })}`);
    if (!res.ok) return;
    const { local } = await res.json();
    sheet.updateCard(card.uid, { local: local ? { lang: tag, name: String(local.name ?? ''), image: String(local.image) } : null });
  } catch {
    // Offline or TCGdex down: the badge still says the language.
  }
}

/** Tags the card in `index` and looks for its picture in that language. */
export function setTag(index: number, tag: string | null) {
  sheet.update(index, { tag, original: false });
  const card = sheet.slots[index];
  if (card) void localize(card);
}

/** The card again in each language, each looking for its own picture. */
export function inLanguages(index: number, tags: string[]) {
  for (const card of sheet.inLanguages(index, tags)) void localize(card);
}
