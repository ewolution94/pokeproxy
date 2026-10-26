<!--
  Where cards come from: the selected slot on top (and, when it holds a card, what it is, the
  language printed on it with a note, its picture in that language where there is one, how it
  prints, the same card in other languages, Once more and Remove), then Search, Link and Upload. A
  column on screens from 760 px, a sheet on a phone.
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
  import { NOTE_MAX, sheet } from '../lib/sheet.svelte.ts';
  import { DEFAULT_LABEL, LABEL_ANGLE, LABEL_SIZE, type LabelLook } from '../lib/layout.ts';
  import { LANGUAGES, language } from '../lib/languages.ts';
  import { inLanguages, setTag } from '../lib/local.ts';
  import { retry } from '../lib/retry.ts';
  import { mm, t, tn } from '../lib/i18n/index.svelte.ts';
  import { toast } from '../../vendor/ewo/elements/toaster.js';

  let { search = $bindable() }: { search?: HTMLInputElement } = $props();

  const at = $derived(sheet.selected);
  const card = $derived(at != null ? sheet.slots[at] : null);
  const place = $derived(at != null ? sheet.where(at) : null);
  const showsLocal = $derived(!!card?.local && card.local.lang === card.tag && !card.original);
  const src = $derived(card ? (card.file ? fileUrl(card.file) : showsLocal ? card.local!.image : (card.thumb ?? card.image)) : undefined);
  const lang = $derived(language(card?.tag));
  /** A tagged catalogue card whose language TCGdex might have, but doesn't for this card. */
  const noLocal = $derived(!!card && card.source === 'catalog' && !!lang?.local && card.local?.lang !== card.tag);

  // A picture of its own (an upload, a link) may be small: say what it prints at.
  let natural = $state(0);
  $effect(() => {
    void card?.uid;
    natural = 0;
  });
  const dpi = $derived(natural ? Math.round(natural / (63 / 25.4)) : 0);

  // The same card in other languages: the ones picked, then placed at once.
  let more = $state<string[]>([]);
  $effect(() => {
    void card?.uid;
    more = [];
  });
  const toggle = (code: string) => (more = more.includes(code) ? more.filter((c) => c !== code) : [...more, code]);

  // Which languages have a picture of their own for this card (an English one from the catalogue),
  // so the picker can say so before anything is placed.
  let pictures = $state<Set<string>>(new Set());
  $effect(() => {
    const ref = card?.source === 'catalog' && card.lang !== 'ja' ? card.ref : undefined;
    pictures = new Set();
    if (!ref) return;
    const c = new AbortController();
    fetch(`/api/local?${new URLSearchParams({ ref, lang: 'all' })}`, { signal: c.signal })
      .then((r) => (r.ok ? r.json() : { langs: [] }))
      .then((d) => (pictures = new Set(d.langs ?? [])))
      .catch(() => {});
    return () => c.abort();
  });

  const label = $derived(card ? sheet.labelOf(card) : DEFAULT_LABEL);
  const PLACES = { top: 0.18, middle: 0.5, bottom: 0.82 } as const;
  /** A finger moves a card by holding it (Pages.svelte); say so where a mouse would just drag. */
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;

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
          {#if src}
            <img
              src={src}
              use:retry
              alt=""
              style:filter={filterFor(sheet.styleOf(card))}
              onload={(e) => card.source !== 'catalog' && (natural = (e.currentTarget as HTMLImageElement).naturalWidth)}
            />
          {/if}
        </span>
        <div class="about">
          <p class="name">{showsLocal && card.local?.name ? card.local.name : card.name}</p>
          {#if card.meta}<p class="meta ewo-mono">{card.meta}</p>{/if}
          {#if dpi && dpi < 200}<p class="lowres">{t('card.lowRes', { px: natural, dpi })}</p>{/if}
          <div class="actions">
            <button type="button" class="act" onclick={() => sheet.duplicate(at)}><Copy size={14} aria-hidden="true" />{t('card.duplicate')}</button>
            <button type="button" class="act danger" onclick={remove}><Trash size={14} aria-hidden="true" />{t('card.remove')}</button>
            {#if card.link}
              <a class="act" href={card.link} target="_blank" rel="noopener noreferrer" title={t('card.source')} aria-label={t('card.source')}><External size={14} aria-hidden="true" /></a>
            {/if}
          </div>
        </div>
      </div>
      <div class="lang">
        <label class="field">
          <span class="label">{t('card.lang')}</span>
          <select value={card.tag ?? ''} onchange={(e) => setTag(at, e.currentTarget.value || null)}>
            <option value="">{t('card.langNone')}</option>
            {#each LANGUAGES as l (l.code)}
              <option value={l.code}>{l.short} · {l.name}{pictures.has(l.code) ? ' ●' : ''}</option>
            {/each}
          </select>
        </label>
        <label class="field">
          <span class="label">{t('card.note')}</span>
          <input
            type="text"
            maxlength={NOTE_MAX}
            placeholder={t('card.notePlaceholder')}
            value={card.note ?? ''}
            onchange={(e) => sheet.update(at, { note: e.currentTarget.value.trim().slice(0, NOTE_MAX) })}
          />
        </label>
      </div>
      {#if card.local && card.local.lang === card.tag && lang}
        <ewo-segmented
          size="sm"
          stretch
          label={t('card.picture')}
          value={card.original ? 'original' : 'local'}
          onchange={(e) => sheet.update(at, { original: e.detail.value === 'original' })}
        >
          <option value="local">{t('card.pictureLocal', { lang: lang.name })}</option>
          <option value="original">{t('card.pictureOriginal')}</option>
        </ewo-segmented>
      {:else if noLocal && lang}
        <p class="hint">{t('card.noLocal', { lang: lang.name })}</p>
      {/if}
      {#if card.tag || card.note}
        <section class="labelbox" aria-label={t('label.title')}>
          <div class="row">
            <span class="label">{t('label.title')}</span>
            <button type="button" class="link" onclick={() => sheet.setLabel(at, DEFAULT_LABEL)}>{t('label.reset')}</button>
          </div>
          <ewo-segmented size="sm" stretch label={t('label.look')} value={label.look} onchange={(e) => sheet.setLabel(at, { look: e.detail.value as LabelLook })}>
            <option value="dark">{t('look.dark')}</option>
            <option value="light">{t('look.light')}</option>
            <option value="band">{t('look.band')}</option>
            <option value="stamp">{t('look.stamp')}</option>
          </ewo-segmented>
          <div class="two">
            <div class="ctl">
              <div class="row"><span class="sub">{t('label.size')}</span><span class="val ewo-mono">{mm(label.size)}</span></div>
              <ewo-slider
                label={t('label.size')}
                min={LABEL_SIZE.min}
                max={LABEL_SIZE.max}
                step={0.5}
                value={label.size}
                format={(v: number) => mm(v)}
                oninput={(e) => sheet.setLabel(at, { size: e.detail.value })}
                onchange={(e) => sheet.setLabel(at, { size: e.detail.value })}
              ></ewo-slider>
            </div>
            <div class="ctl">
              <div class="row"><span class="sub">{t('label.angle')}</span><span class="val ewo-mono">{label.angle}°</span></div>
              <ewo-slider
                label={t('label.angle')}
                min={-LABEL_ANGLE}
                max={LABEL_ANGLE}
                step={1}
                value={label.angle}
                format={(v: number) => `${v}°`}
                oninput={(e) => sheet.setLabel(at, { angle: e.detail.value })}
                onchange={(e) => sheet.setLabel(at, { angle: e.detail.value })}
              ></ewo-slider>
            </div>
          </div>
          <div class="places" role="group" aria-label={t('label.place')}>
            <span class="sub">{t('label.place')}</span>
            {#each Object.entries(PLACES) as [name, y] (name)}
              <button type="button" class="chip" class:on={Math.abs(label.y - y) < 0.02 && Math.abs(label.x - 0.5) < 0.02} onclick={() => sheet.setLabel(at, { x: 0.5, y })}>{t(`place.${name}` as 'place.top')}</button>
            {/each}
          </div>
          <p class="hint">{t('label.hint')}</p>
          <ewo-switch row checked={!!card.label} onchange={(e) => sheet.ownLabel(at, e.detail.checked)}>
            {t('label.own')}
            <span slot="hint">{t('label.ownHint')}</span>
          </ewo-switch>
        </section>
      {/if}
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
      <details class="more">
        <summary>{t('card.more')}</summary>
        <p class="hint">{t('card.moreHint')}</p>
        {#if pictures.size}<p class="hint">{t('card.pictures')}</p>{/if}
        <div class="chips">
          {#each LANGUAGES as l (l.code)}
            {#if l.code !== card.tag}
              <button type="button" class="chip" class:on={more.includes(l.code)} aria-pressed={more.includes(l.code)} onclick={() => toggle(l.code)}>
                <b>{l.short}</b> {l.name}{#if pictures.has(l.code)}<i class="pic-dot" aria-hidden="true">●</i>{/if}
              </button>
            {/if}
          {/each}
        </div>
        <button
          type="button"
          class="add"
          disabled={!more.length}
          onclick={() => {
            inLanguages(at, more);
            more = [];
          }}>{more.length ? tn('card.moreGo', more.length) : t('card.morePick')}</button
        >
      </details>
      <p class="replace">{t('card.replace')}{#if touch}{' '}{t('card.moveTouch')}{/if}</p>
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


  .labelbox {
    display: grid;
    gap: 0.6rem;
    padding: 0.75rem;
    border: 1px solid var(--ewo-line);
    border-radius: var(--ewo-r-sm);
  }

  .labelbox .row,
  .ctl .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .two {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.9rem;
  }

  .ctl {
    display: grid;
    gap: 0.2rem;
    min-width: 0;
  }

  .sub {
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg-2);
  }

  .val {
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg);
  }

  .places {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
  }

  .places .sub {
    margin-right: 0.25rem;
  }

  .link {
    padding: 0;
    border: 0;
    background: none;
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg-3);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .link:hover {
    color: var(--ewo-fg);
  }

  .pic-dot {
    font-style: normal;
    font-size: 0.6rem;
    color: var(--ewo-project-pokeproxy);
  }

  .lang {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0.6rem;
  }

  .field {
    display: grid;
    gap: 0.35rem;
    min-width: 0;
  }

  .field select,
  .field input {
    width: 100%;
    height: 2.1rem;
    padding: 0 0.55rem;
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-xs);
    background: var(--ewo-bg-raised);
    color: var(--ewo-fg);
    font: inherit;
    font-size: var(--ewo-text-sm);
  }

  .hint,
  .lowres {
    margin: 0;
    font-size: var(--ewo-text-xs);
    line-height: 1.45;
    color: var(--ewo-fg-3);
  }

  .lowres {
    margin-top: 0.15rem;
    color: var(--ewo-warn);
  }

  .more {
    display: grid;
    gap: 0.55rem;
  }

  .more summary {
    cursor: pointer;
    font-size: var(--ewo-text-sm);
    font-weight: 500;
    color: var(--ewo-fg-2);
  }

  .more summary:hover {
    color: var(--ewo-fg);
  }

  .more[open] {
    padding-bottom: 0.25rem;
  }

  .more > .hint {
    margin-top: 0.4rem;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
  }

  .chip {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3rem;
    height: 1.8rem;
    padding: 0 0.6rem;
    border: 1px solid var(--ewo-line);
    border-radius: var(--ewo-r-pill);
    background: none;
    font-size: var(--ewo-text-xs);
    line-height: 1.8rem;
    color: var(--ewo-fg-2);
  }

  .chip b {
    font-family: var(--ewo-mono);
    font-size: var(--ewo-text-2xs);
    font-weight: 600;
  }

  .chip.on {
    border-color: var(--ewo-project-pokeproxy);
    background: color-mix(in oklab, var(--ewo-project-pokeproxy) 12%, transparent);
    color: var(--ewo-fg);
  }

  .add {
    justify-self: start;
    height: 2.1rem;
    padding: 0 0.9rem;
    border: 0;
    border-radius: var(--ewo-r-pill);
    background: var(--ewo-fg);
    color: var(--ewo-bg);
    font-size: var(--ewo-text-sm);
    font-weight: 500;
  }

  .add:disabled {
    background: var(--ewo-fill-3);
    color: var(--ewo-fg-3);
    cursor: default;
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
