<!--
  PokeProxy: printable proxy sheets. Desktop first, in three columns: the sheet's setup, the pages
  as they'll print, and the cards to put on them. Below 1180 px the setup moves into a sheet (the
  header's Sheet button); below 760 px the cards do too, opening when a slot is tapped.

  Anywhere outside a text field: ⌘V pastes a link or a picture into the selected slot, `/` goes
  to the search, `,` opens Settings.
-->
<script lang="ts">
  import Header from './components/Header.svelte';
  import Setup from './components/Setup.svelte';
  import Pages from './components/Pages.svelte';
  import Picker from './components/Picker.svelte';
  import Settings from './components/Settings.svelte';
  import { placeFilesWithNote, placeLink, tidyFiles } from './lib/actions.svelte.ts';
  import { isPicture } from './lib/files.svelte.ts';
  import { prefs, ui } from './lib/prefs.svelte.ts';
  import { sheet } from './lib/sheet.svelte.ts';
  import { t } from './lib/i18n/index.svelte.ts';

  const wideQuery = matchMedia('(min-width: 1180px)');
  const midQuery = matchMedia('(min-width: 760px)');
  let wide = $state(wideQuery.matches);
  let mid = $state(midQuery.matches);
  wideQuery.addEventListener('change', (e) => (wide = e.matches));
  midQuery.addEventListener('change', (e) => (mid = e.matches));

  let search: HTMLInputElement | undefined = $state();
  let colWidth = $state(0);
  let colHeight = $state(0);

  // The sheets close themselves once their column is back.
  $effect(() => {
    if (wide) ui.setup = false;
    if (mid) ui.picker = false;
  });

  // The paper size the printer gets: @page can't take a custom property, so it's written out.
  const pageStyle = document.createElement('style');
  document.head.append(pageStyle);
  $effect(() => {
    const { pw, ph } = sheet.geometry;
    pageStyle.textContent = `@page { size: ${pw}mm ${ph}mm; margin: 0; }`;
  });

  // Pictures no slot uses any more go from IndexedDB a while after the last change.
  let tidy: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void sheet.slots.length;
    void sheet.cardCount;
    clearTimeout(tidy);
    tidy = setTimeout(tidyFiles, 60_000);
  });

  const typing = (target: EventTarget | null) =>
    target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));

  function paste(e: ClipboardEvent) {
    if (typing(e.target) || ui.settings) return;
    const files = [...(e.clipboardData?.files ?? [])].filter(isPicture);
    if (files.length) {
      e.preventDefault();
      void placeFilesWithNote(files);
      return;
    }
    const text = e.clipboardData?.getData('text/plain').trim() ?? '';
    if (/^(https?:\/\/)?[\w.-]+\.[a-z]{2,}(\/\S*)?$/i.test(text)) {
      e.preventDefault();
      void placeLink.run(text, sheet.selected, true);
    }
  }

  function keydown(e: KeyboardEvent) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (typing(e.target) || ui.settings) return;
    if (e.key === '/') {
      e.preventDefault();
      prefs.tab = 'search';
      if (!mid) ui.picker = true;
      requestAnimationFrame(() => search?.focus());
    } else if (e.key === ',') {
      e.preventDefault();
      ui.settings = true;
    }
  }

  function picked() {
    if (!mid) ui.picker = true;
  }

  // The sheets' content stays until their exit animation is done (Folio's ewo-sheet `close`).
  let setupShown = $state(false);
  let pickerShown = $state(false);
  $effect(() => {
    if (ui.setup) setupShown = true;
  });
  $effect(() => {
    if (ui.picker) pickerShown = true;
  });
</script>

<svelte:window onpaste={paste} onkeydown={keydown} />

<Header setupInline={wide} />

<div class="work" class:wide class:mid>
  {#if wide}
    <aside class="col setup-col" aria-label={t('setup.title')}>
      <Setup />
    </aside>
  {/if}
  <main class="col pages-col" bind:clientWidth={colWidth} bind:clientHeight={colHeight}>
    <Pages
      width={colWidth}
      height={colHeight}
      fit={mid ? 'both' : 'width'}
      onpick={picked}
      ondropfiles={(files, at) => placeFilesWithNote(files, at)}
    />
  </main>
  {#if mid}
    <aside class="col picker-col" aria-label={t('picker.title')}>
      <Picker bind:search />
    </aside>
  {/if}
</div>

{#if !wide}
  <ewo-sheet open={ui.setup} label={t('setup.title')} oncancel={() => (ui.setup = false)} onclose={() => ((setupShown = false), (ui.setup = false))}>
    <span slot="heading">{t('setup.title')}</span>
    {#if setupShown}<Setup />{/if}
  </ewo-sheet>
{/if}

{#if !mid}
  <ewo-sheet open={ui.picker} label={t('picker.title')} oncancel={() => (ui.picker = false)} onclose={() => ((pickerShown = false), (ui.picker = false))}>
    <span slot="heading">{t('picker.title')}</span>
    {#if pickerShown}
      <div class="sheet-picker"><Picker bind:search /></div>
    {/if}
  </ewo-sheet>
{/if}

<Settings />

<style>
  .work {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
  }

  .pages-col {
    background-color: var(--ewo-bg-sunk);
    /* A cutting mat's grid, very faint: the paper lies on it. */
    background-image:
      linear-gradient(var(--ewo-line-2) 1px, transparent 1px),
      linear-gradient(90deg, var(--ewo-line-2) 1px, transparent 1px);
    background-size: 32px 32px;
    background-position: -1px -1px;
  }

  .col {
    min-width: 0;
  }

  .work.mid {
    grid-template-columns: minmax(0, 1fr) 380px;
    height: calc(100dvh - var(--ewo-bar-h));
  }

  .work.wide {
    grid-template-columns: 272px minmax(0, 1fr) 400px;
  }

  .work.mid .col {
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .setup-col,
  .picker-col {
    --panel-bg: var(--ewo-bg);
    padding: 1.1rem 1.25rem 2rem;
    background: var(--ewo-bg);
  }

  .setup-col {
    border-right: 1px solid var(--ewo-line);
  }

  .picker-col {
    border-left: 1px solid var(--ewo-line);
  }

  /* One height whatever the tab shows, so the sheet doesn't jump as results come in. */
  .sheet-picker {
    --panel-bg: var(--ewo-bg-raised);
    min-height: min(70svh, 640px);
  }

  .work:not(.mid) .pages-col {
    min-height: calc(100dvh - var(--ewo-bar-h));
  }

  @media print {
    .work {
      display: block;
      height: auto !important;
    }

    .setup-col,
    .picker-col {
      display: none;
    }

    .pages-col {
      background: none;
      overflow: visible !important;
    }
  }
</style>
