<!--
  Share, in the header: copy the sheet as a link, save it as a file, or open a saved one
  (sharing.ts). A popover under the button; Escape or a click elsewhere closes it. The link is
  made when the menu opens, so Copy can write it in the same click (Safari asks for that).
-->
<script lang="ts">
  import Share from '@lucide/svelte/icons/share';
  import LinkIcon from '@lucide/svelte/icons/link';
  import Download from '@lucide/svelte/icons/download';
  import FolderOpen from '@lucide/svelte/icons/folder-open';
  import { openSheetFile, saveSheetFile, sheetLink, type SheetLink } from '../lib/sharing.ts';
  import { sheet } from '../lib/sheet.svelte.ts';
  import { t, tn } from '../lib/i18n/index.svelte.ts';
  import { toast } from '../../vendor/ewo/elements/toaster.js';

  let button: HTMLButtonElement | undefined = $state();
  let menu: HTMLDivElement | undefined = $state();
  let picker: HTMLInputElement | undefined = $state();
  let link = $state<SheetLink | null>(null);
  /** The clipboard said no: the link shows in a field to copy by hand. */
  let failed = $state(false);

  const uploads = $derived(sheet.slots.filter((c) => c?.source === 'file').length);

  function toggled(e: ToggleEvent) {
    if (e.newState !== 'open' || !button || !menu) return;
    // Under the button, its right edge on the button's, but never past the window's left edge.
    const r = button.getBoundingClientRect();
    menu.style.top = `${r.bottom + 6}px`;
    menu.style.right = `${Math.min(Math.max(8, innerWidth - r.right), innerWidth - menu.offsetWidth - 8)}px`;
    failed = false;
    link = null;
    void sheetLink().then((l) => (link = l));
  }

  async function copy() {
    try {
      if (link) await navigator.clipboard.writeText(link.url);
      else {
        // Not made yet: the clipboard takes the promise, which keeps the click's permission.
        const made = sheetLink().then((l) => ((link = l), new Blob([l.url], { type: 'text/plain' })));
        await navigator.clipboard.write([new ClipboardItem({ 'text/plain': made })]);
      }
      menu?.hidePopover();
      toast(link?.left ? tn('share.copiedLeft', link.left) : t('share.copied'), { tone: 'ok', duration: link?.left ? 7000 : undefined });
    } catch {
      if (!link) link = await sheetLink();
      failed = true;
    }
  }

  function save() {
    menu?.hidePopover();
    void saveSheetFile();
  }

  function chosen(e: Event & { currentTarget: HTMLInputElement }) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    menu?.hidePopover();
    if (file) void openSheetFile(file);
  }
</script>

<button bind:this={button} type="button" class="ghost" popovertarget="share-menu">
  <Share size={16} aria-hidden="true" />
  <span>{t('share.title')}</span>
</button>

<div bind:this={menu} id="share-menu" class="menu" popover="auto" ontoggle={toggled}>
  <button type="button" class="item" onclick={copy}>
    <LinkIcon size={18} aria-hidden="true" />
    <span class="text">
      <span class="name">{t('share.copy')}</span>
      <span class="hint">{uploads ? tn('share.copyHintLeft', uploads) : t('share.copyHint')}</span>
    </span>
  </button>
  {#if failed && link}
    <label class="fallback">
      <span class="hint">{t('share.copyByHand')}</span>
      <input type="text" readonly value={link.url} onfocus={(e) => e.currentTarget.select()} />
    </label>
  {/if}
  <button type="button" class="item" onclick={save}>
    <Download size={18} aria-hidden="true" />
    <span class="text">
      <span class="name">{t('share.save')}</span>
      <span class="hint">{t('share.saveHint')}</span>
    </span>
  </button>
  <button type="button" class="item" onclick={() => picker?.click()}>
    <FolderOpen size={18} aria-hidden="true" />
    <span class="text">
      <span class="name">{t('share.open')}</span>
      <span class="hint">{t('share.openHint')}</span>
    </span>
  </button>
  <input bind:this={picker} type="file" accept=".json,application/json" hidden onchange={chosen} />
</div>

<style>
  .ghost {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.25rem;
    padding: 0 0.85rem;
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-pill);
    background: none;
    color: var(--ewo-fg-2);
    font-size: var(--ewo-text-sm);
    font-weight: 500;
    white-space: nowrap;
  }

  .ghost:hover {
    color: var(--ewo-fg);
  }

  .menu {
    position: fixed;
    inset: auto;
    margin: 0;
    width: min(20rem, calc(100vw - 1rem));
    padding: 0.35rem;
    border: 1px solid var(--ewo-line);
    border-radius: var(--ewo-r-md, 14px);
    background: var(--ewo-bg-raised);
    color: var(--ewo-fg);
    box-shadow:
      0 12px 32px rgb(0 0 0 / 0.18),
      0 1px 3px rgb(0 0 0 / 0.12);
  }

  .menu:popover-open {
    display: grid;
    gap: 0.1rem;
  }

  .item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    align-items: start;
    padding: 0.65rem 0.7rem;
    border: 0;
    border-radius: var(--ewo-r-sm);
    background: none;
    color: var(--ewo-fg);
    text-align: left;
  }

  .item :global(svg) {
    margin-top: 0.1rem;
    color: var(--ewo-fg-2);
  }

  .item:hover {
    background: var(--ewo-fill-2);
  }

  .item:focus-visible {
    outline: 2px solid var(--ewo-project-pokeproxy);
    outline-offset: -2px;
  }

  .text {
    display: grid;
    gap: 0.15rem;
  }

  .name {
    font-size: var(--ewo-text-sm);
    font-weight: 500;
  }

  .hint {
    font-size: var(--ewo-text-xs);
    line-height: 1.4;
    color: var(--ewo-fg-3);
  }

  .fallback {
    display: grid;
    gap: 0.35rem;
    padding: 0 0.7rem 0.6rem 2.85rem;
  }

  .fallback input {
    width: 100%;
    height: 2rem;
    padding: 0 0.5rem;
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-xs);
    background: var(--ewo-bg);
    color: var(--ewo-fg);
    font-family: var(--ewo-mono);
    font-size: var(--ewo-text-2xs);
  }

  @media (max-width: 559.98px) {
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

  @media print {
    .menu {
      display: none;
    }
  }
</style>
