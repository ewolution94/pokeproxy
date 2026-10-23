<!--
  Where cards come from: the selected slot on top (and, when it holds a card, what it is, how it
  prints, Once more and Remove), then Search, Link and Upload. A column on screens from 760 px,
  a sheet on a phone.
-->
<script lang="ts">
  import Copy from '@lucide/svelte/icons/copy-plus';
  import Trash from '@lucide/svelte/icons/trash-2';
  import External from '@lucide/svelte/icons/external-link';
  import SearchTab from './SearchTab.svelte';
  import LinkTab from './LinkTab.svelte';
  import UploadTab from './UploadTab.svelte';
  import { fileUrl } from '../lib/files.svelte.ts';
  import { filterFor, type PrintStyle } from '../lib/layout.ts';
  import { prefs, type Tab } from '../lib/prefs.svelte.ts';
  import { sheet } from '../lib/sheet.svelte.ts';
  import { t } from '../lib/i18n/index.svelte.ts';
  import { toast } from '../../vendor/ewo/elements/toaster.js';

  let { search = $bindable() }: { search?: HTMLInputElement } = $props();

  const at = $derived(sheet.selected);
  const card = $derived(at != null ? sheet.slots[at] : null);
  const place = $derived(at != null ? sheet.where(at) : null);
  const src = $derived(card ? (card.file ? fileUrl(card.file) : (card.thumb ?? card.image)) : undefined);

  function remove() {
    if (at == null) return;
    sheet.remove(at);
    toast(t('toast.removed'), { action: { label: t('toast.undo'), run: () => sheet.undo() } });
  }
</script>

<div class="picker">
  <div class="target">
    {#if place}
      <p class="where ewo-mono">{t('picker.target', { slot: place.cell + 1, page: place.page + 1 })}</p>
    {:else}
      <p class="where ewo-mono">{t('picker.noTarget')}</p>
    {/if}

    {#if card && at != null}
      <div class="card">
        <span class="pic">
          {#if src}<img src={src} alt="" style:filter={filterFor(sheet.styleOf(card))} />{/if}
        </span>
        <div class="about">
          <p class="name">{card.name}</p>
          {#if card.meta}<p class="meta ewo-mono">{card.meta}</p>{/if}
          <div class="actions">
            <button type="button" class="act" onclick={() => sheet.duplicate(at)}><Copy size={14} aria-hidden="true" />{t('card.duplicate')}</button>
            <button type="button" class="act danger" onclick={remove}><Trash size={14} aria-hidden="true" />{t('card.remove')}</button>
            {#if card.link}
              <a class="act" href={card.link} target="_blank" rel="noopener noreferrer" title={t('card.source')} aria-label={t('card.source')}><External size={14} aria-hidden="true" /></a>
            {/if}
          </div>
        </div>
      </div>
      <div class="style">
        <span class="label">{t('card.style')}</span>
        <ewo-segmented
          size="sm"
          stretch
          label={t('card.style')}
          value={card.style ?? 'sheet'}
          onchange={(e) => sheet.setStyle(at, e.detail.value === 'sheet' ? null : (e.detail.value as PrintStyle))}
        >
          <option value="sheet">{t('style.sheet')}</option>
          <option value="colour">{t('style.colour')}</option>
          <option value="grey">{t('style.grey')}</option>
          <option value="light">{t('style.light')}</option>
        </ewo-segmented>
      </div>
      <p class="replace">{t('card.replace')}</p>
    {/if}
  </div>

  <ewo-segmented class="tabs" stretch label={t('picker.title')} value={prefs.tab} onchange={(e) => (prefs.tab = e.detail.value as Tab)}>
    <option value="search">{t('tab.search')}</option>
    <option value="link">{t('tab.link')}</option>
    <option value="upload">{t('tab.upload')}</option>
  </ewo-segmented>

  <div class="body">
    {#if prefs.tab === 'search'}
      <SearchTab bind:input={search} />
    {:else if prefs.tab === 'link'}
      <LinkTab />
    {:else}
      <UploadTab />
    {/if}
  </div>
</div>

<style>
  .picker {
    display: grid;
    gap: 0.9rem;
    align-content: start;
  }

  .target {
    display: grid;
    gap: 0.7rem;
  }

  .where {
    margin: 0;
    font-size: var(--ewo-text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
    color: var(--ewo-project-pokeproxy);
  }

  .card {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    gap: 0.8rem;
    align-items: start;
  }

  .pic {
    display: block;
    aspect-ratio: 63 / 88;
    border-radius: 4.5% / 3.2%;
    overflow: hidden;
    background: var(--ewo-fill-2);
  }

  .pic img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .about {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .name {
    margin: 0;
    font-size: var(--ewo-text-md);
    font-weight: 600;
    line-height: 1.3;
    overflow-wrap: anywhere;
  }

  .meta {
    margin: 0;
    font-size: var(--ewo-text-2xs);
    color: var(--ewo-fg-3);
    overflow-wrap: anywhere;
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.45rem;
  }

  .act {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    height: 1.9rem;
    padding: 0 0.6rem;
    border: 1px solid var(--ewo-line);
    border-radius: var(--ewo-r-pill);
    background: none;
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg-2);
  }

  .act:hover {
    color: var(--ewo-fg);
    border-color: var(--ewo-line-strong);
  }

  .act.danger:hover {
    color: var(--ewo-bad);
  }

  .style {
    display: grid;
    gap: 0.4rem;
  }


  .replace {
    margin: 0;
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg-3);
  }

  .tabs {
    margin-top: 0.15rem;
  }
</style>
