// The languages Pokémon cards are printed in, as a card's tag on the sheet: the badge printed on it
// says which version the proxy stands in for ("DE · Deutsch"). `local` marks the ones TCGdex has
// pictures for (server/localized.mjs): a tagged catalogue card shows that picture when there is one.

export interface Language {
  code: string;
  /** On the badge, before the name: the code collectors use. */
  short: string;
  /** In its own language. */
  name: string;
  local?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', short: 'EN', name: 'English' },
  { code: 'de', short: 'DE', name: 'Deutsch', local: true },
  { code: 'fr', short: 'FR', name: 'Français', local: true },
  { code: 'it', short: 'IT', name: 'Italiano', local: true },
  { code: 'es', short: 'ES', name: 'Español', local: true },
  { code: 'pt', short: 'PT', name: 'Português', local: true },
  { code: 'nl', short: 'NL', name: 'Nederlands' },
  { code: 'pl', short: 'PL', name: 'Polski' },
  { code: 'ru', short: 'RU', name: 'Русский' },
  { code: 'ja', short: 'JP', name: '日本語' },
  { code: 'ko', short: 'KR', name: '한국어' },
  { code: 'zh-hans', short: 'SC', name: '简体中文' },
  { code: 'zh-hant', short: 'TC', name: '繁體中文', local: true },
  { code: 'id', short: 'ID', name: 'Bahasa Indonesia' },
  { code: 'th', short: 'TH', name: 'ไทย' },
];

const BY_CODE = new Map(LANGUAGES.map((l) => [l.code, l]));

export const language = (code: string | null | undefined) => (code ? BY_CODE.get(code) : undefined);

/** The badge's text: "DE · Deutsch", with the note after it ("DE · Deutsch · 1st Edition"). */
export function badgeText(tag: string | null | undefined, note: string | null | undefined): string {
  const l = language(tag);
  return [l ? `${l.short} · ${l.name}` : '', note?.trim() ?? ''].filter(Boolean).join(' · ');
}
