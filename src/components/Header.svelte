<!--
  The sticky header: the name, how much is on the sheet, the setup (where it isn't a column of
  its own), Share (a link or a file, ShareMenu), Print and the settings button (Folio's, the same in
  every app).
-->
<script lang="ts">
  import Printer from '@lucide/svelte/icons/printer';
  import Sliders from '@lucide/svelte/icons/ruler-dimension-line';
  import ShareMenu from './ShareMenu.svelte';
  import { printSheet } from '../lib/actions.svelte.ts';
  import { ui } from '../lib/prefs.svelte.ts';
  import { sheet } from '../lib/sheet.svelte.ts';
  import { t, tn } from '../lib/i18n/index.svelte.ts';

  let { setupInline }: { setupInline: boolean } = $props();
</script>

<header class="bar">
  <a class="brand" href="/" onclick={(e) => e.preventDefault()}>
    <img src="/icon.svg" alt="" width="26" height="26" />
    <span class="word">PokeProxy</span>
  </a>
  <p class="summary ewo-mono" aria-live="polite">
    {tn('count.cards', sheet.cardCount)} · {tn('count.pages', sheet.pageCount)}
  </p>
  <div class="end">
    {#if !setupInline}
      <button type="button" class="ghost" onclick={() => (ui.setup = true)}>
        <Sliders size={16} aria-hidden="true" />
        <span>{t('header.setup')}</span>
      </button>
    {/if}
    <ShareMenu />
    <button type="button" class="print" onclick={printSheet} disabled={!sheet.cardCount}>
      <Printer size={16} aria-hidden="true" />
      <span>{t('header.print')}</span>
    </button>
    <!-- Its own <button> inside takes the keys and names itself (after <html lang>); the click bubbles out. -->
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <ewo-settings-button class="settings" onclick={() => (ui.settings = true)}></ewo-settings-button>
  </div>
</header>

<style>
  .bar {
    position: sticky;
    top: 0;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: var(--ewo-space-4);
    height: var(--ewo-bar-h);
    padding: 0 max(1rem, env(safe-area-inset-left)) 0 max(1rem, env(safe-area-inset-left));
    background: var(--ewo-bg);
    border-bottom: 1px solid var(--ewo-line);
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 650;
    letter-spacing: -0.01em;
    font-size: var(--ewo-text-lg);
    white-space: nowrap;
    cursor: default;
  }

  .summary {
    margin: 0;
    font-size: var(--ewo-text-2xs);
    font-weight: 500;
    color: var(--ewo-fg-3);
    white-space: nowrap;
  }

  .end {
    display: flex;
    align-items: center;
    gap: var(--ewo-space-2);
    margin-left: auto;
  }

  .ghost,
  .print {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.25rem;
    padding: 0 0.85rem;
    border-radius: var(--ewo-r-pill);
    font-size: var(--ewo-text-sm);
    font-weight: 500;
    white-space: nowrap;
  }

  .ghost {
    border: 1px solid var(--ewo-line-strong);
    background: none;
    color: var(--ewo-fg-2);
  }

  .ghost:hover {
    color: var(--ewo-fg);
  }

  .print {
    border: 0;
    background: var(--ewo-project-pokeproxy);
    color: light-dark(#fff, #04140e);
  }

  .print:hover:not(:disabled) {
    background: color-mix(in oklab, var(--ewo-project-pokeproxy) 88%, var(--ewo-fg));
  }

  .print:disabled {
    background: var(--ewo-fill-3);
    color: var(--ewo-fg-3);
    cursor: default;
  }

  .settings {
    flex: none;
    margin-right: -6px;
  }

  @media (max-width: 559.98px) {
    .summary {
      display: none;
    }

    .ghost span {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }

    .ghost {
      width: 2.25rem;
      padding: 0;
      justify-content: center;
    }
  }

  @media (max-width: 379.98px) {
    .brand .word {
      display: none;
    }
  }

  @media print {
    .bar {
      display: none;
    }
  }
</style>
