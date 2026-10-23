// This device's preferences (the theme lives in theme.svelte.ts, which boot.js mirrors before
// first paint), and what's open right now.

import type { Lang } from './api.ts';

export type Language = 'system' | 'en' | 'de';
export type Tab = 'search' | 'link' | 'upload';

interface Prefs {
  language: Language;
  /** Which cards the search finds: all, the English ones or the Japanese ones. */
  lang: Lang;
  tab: Tab;
}

const KEY = 'pokeproxy:prefs';
const DEFAULTS: Prefs = { language: 'system', lang: 'all', tab: 'search' };

function load(): Prefs {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export const prefs = $state<Prefs>(load());

/** What's open: the settings, and on narrower screens the sheet's setup and the card picker. */
export const ui = $state({ settings: false, setup: false, picker: false, query: '' });

$effect.root(() => {
  $effect(() => {
    const snapshot = JSON.stringify(prefs);
    try {
      localStorage.setItem(KEY, snapshot);
    } catch {}
  });
});
