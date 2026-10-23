<!--
  Search TCGSL's catalogue: as you type, 48 cards at a time, best fit first and the newest sets
  first among equals. A click puts the card in the selected slot and moves on to the next empty
  one, so a page fills with a few clicks.
-->
<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import { ApiError, fromCatalog, metaOf, nameOf, searchCards, type CatalogCard, type Lang } from '../lib/api.ts';
  import { prefs, ui } from '../lib/prefs.svelte.ts';
  import { sheet } from '../lib/sheet.svelte.ts';
  import { t, tn } from '../lib/i18n/index.svelte.ts';

  let { input = $bindable() }: { input?: HTMLInputElement } = $props();

  let cards = $state<CatalogCard[]>([]);
  let total = $state(0);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let more = $state(false);
  let asked = $state('');

  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function run(q: string, lang: Lang, offset = 0) {
    controller?.abort();
    const c = (controller = new AbortController());
    if (!q.trim()) {
      cards = [];
      total = 0;
      error = null;
      asked = '';
      busy = false;
      return;
    }
    busy = true;
    try {
      const res = await searchCards(q, lang, offset, c.signal);
      if (c.signal.aborted) return;
      cards = offset ? [...cards, ...res.cards] : res.cards;
      total = res.total;
      error = null;
      asked = q;
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      error = err instanceof ApiError ? err.code : 'failed';
      // The catalogue loads when the server starts: ask again shortly.
      if (error === 'loading') timer = setTimeout(() => run(q, lang, offset), 2500);
    } finally {
      if (!c.signal.aborted) {
        busy = false;
        more = false;
      }
    }
  }

  // As you type, a moment after the last key.
  $effect(() => {
    const q = ui.query;
    const lang = prefs.lang;
    clearTimeout(timer);
    timer = setTimeout(() => run(q, lang), q.trim() ? 160 : 0);
    return () => clearTimeout(timer);
  });

  function showMore() {
    more = true;
    void run(ui.query, prefs.lang, cards.length);
  }

  function place(card: CatalogCard) {
    sheet.place([fromCatalog(card)]);
  }

  function enter(e: KeyboardEvent) {
    if (e.key === 'Enter' && cards[0]) {
      e.preventDefault();
      place(cards[0]);
    }
  }
</script>

<div class="search">
  <div class="query">
    <label class="field">
      <span class="sr">{t('search.label')}</span>
      <Search size={15} aria-hidden="true" />
      <input
        bind:this={input}
        bind:value={ui.query}
        type="search"
        placeholder={t('search.placeholder')}
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="search"
        onkeydown={enter}
      />
    </label>
    <ewo-segmented size="sm" label={t('search.lang')} value={prefs.lang} onchange={(e) => (prefs.lang = e.detail.value as Lang)}>
      <option value="all">{t('lang.all')}</option>
      <option value="en">{t('lang.en')}</option>
      <option value="ja">{t('lang.ja')}</option>
    </ewo-segmented>
  </div>

  {#if error}
    <p class="note" class:bad={error !== 'loading'}>{t(`search.${error}` as 'search.failed')}</p>
  {:else if !ui.query.trim()}
    <p class="note">{t('search.hint')}</p>
  {:else if asked && !total && !busy}
    <p class="note">{t('search.none', { q: asked })}</p>
  {:else if asked}
    <p class="count ewo-mono" aria-live="polite">{tn('search.count', total)}</p>
  {/if}

  {#if cards.length && ui.query.trim()}
    <ul class="results" class:stale={busy && !more}>
      {#each cards as card (card.id)}
        <li>
          <button type="button" class="result" title={t('search.place', { name: nameOf(card) })} onclick={() => place(card)}>
            <span class="pic">
              <img src={card.thumb} alt="" loading="lazy" decoding="async" width="120" height="168" />
              {#if card.lang === 'ja'}<span class="jp ewo-mono">JP</span>{/if}
            </span>
            <span class="name">{nameOf(card)}</span>
            <span class="meta ewo-mono">{metaOf(card)}</span>
          </button>
        </li>
      {/each}
    </ul>
    {#if cards.length < total}
      <button type="button" class="more" disabled={more} onclick={showMore}>{t('search.more')}</button>
    {/if}
  {/if}

  <p class="source">
    <a href="https://tcgsl.ewolution.cloud/" target="_blank" rel="noopener">{t('search.source')}</a>
  </p>
</div>

<style>
  .search {
    display: grid;
    gap: 0.75rem;
  }

  .query {
    position: sticky;
    top: 0;
    z-index: 1;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
    align-items: center;
    padding-block: 0.25rem 0.5rem;
    background: var(--panel-bg, var(--ewo-bg-raised));
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.35rem;
    padding: 0 0.7rem;
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-sm);
    background: var(--ewo-bg);
    color: var(--ewo-fg-3);
  }

  .field:focus-within {
    border-color: var(--ewo-fg-3);
  }

  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    font-size: var(--ewo-text-md);
    color: var(--ewo-fg);
  }

  .field input::placeholder {
    color: var(--ewo-fg-3);
  }

  .note,
  .count {
    margin: 0;
    font-size: var(--ewo-text-xs);
    line-height: 1.5;
    color: var(--ewo-fg-3);
  }

  .note.bad {
    color: var(--ewo-bad);
  }

  .results {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 0.9rem 0.6rem;
    margin: 0;
    padding: 0;
    list-style: none;
    transition: opacity var(--ewo-dur-2) ease;
  }

  .results.stale {
    opacity: 0.55;
  }

  .result {
    display: grid;
    gap: 0.3rem;
    width: 100%;
    padding: 0;
    border: 0;
    background: none;
    text-align: left;
  }

  .pic {
    position: relative;
    display: block;
    aspect-ratio: 63 / 88;
    border-radius: 4.5% / 3.2%;
    background: var(--ewo-fill-2);
    overflow: hidden;
  }

  .pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform var(--ewo-dur-2) var(--ewo-ease);
  }

  @media (hover: hover) {
    .result:hover .pic img {
      transform: scale(1.04);
    }
  }

  .result:focus-visible {
    outline: none;
  }

  .result:focus-visible .pic {
    outline: 2px solid var(--ewo-project-pokeproxy);
    outline-offset: 2px;
  }

  .jp {
    position: absolute;
    right: 5px;
    bottom: 5px;
    padding: 1px 4px;
    border-radius: 4px;
    background: rgb(0 0 0 / 0.7);
    color: #fff;
    font-size: 9px;
    font-weight: 600;
  }

  .name {
    overflow: hidden;
    font-size: var(--ewo-text-xs);
    font-weight: 500;
    line-height: 1.25;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ewo-fg);
  }

  .meta {
    overflow: hidden;
    margin-top: -0.15rem;
    font-size: 10px;
    white-space: nowrap;
    text-overflow: ellipsis;
    color: var(--ewo-fg-3);
  }

  .more {
    justify-self: center;
    height: 2.1rem;
    padding: 0 1rem;
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-pill);
    background: none;
    font-size: var(--ewo-text-sm);
    color: var(--ewo-fg-2);
  }

  .more:hover:not(:disabled) {
    color: var(--ewo-fg);
    border-color: var(--ewo-fg-3);
  }

  .source {
    margin: 0.5rem 0 0;
    font-size: var(--ewo-text-2xs);
    color: var(--ewo-fg-3);
  }

  .source a:hover {
    color: var(--ewo-fg);
  }
</style>
