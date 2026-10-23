<!--
  The pages as they will print: white paper at the real proportions, the cards where they'll be,
  the cut marks and the scale check. Everything is placed in millimetres times --mm, which is a
  screen scale here (the page fits the column) and exactly 1mm in print (app.css), so what you see
  is what comes out of the printer.

  A slot takes a click (select it), a card dragged from another slot (swap), and pictures dropped
  from the desktop (placed from that slot on). The arrow keys move between slots, Delete removes.
  Cards move with the pointer's own drag, not the browser's drag and drop, so the cursor can say
  what's happening: an open hand over a card, a closed one while it's carried (the browser draws
  its own cursor during drag and drop, which stays for files only).
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import X from '@lucide/svelte/icons/x';
  import Plus from '@lucide/svelte/icons/plus';
  import Trash from '@lucide/svelte/icons/trash-2';
  import { pictureOf, sheet, type Card } from '../lib/sheet.svelte.ts';
  import { badgeText } from '../lib/languages.ts';
  import { retry } from '../lib/retry.ts';
  import { PAPERS, filterFor } from '../lib/layout.ts';
  import { fileUrl } from '../lib/files.svelte.ts';
  import { t } from '../lib/i18n/index.svelte.ts';
  import { toast } from '../../vendor/ewo/elements/toaster.js';

  let {
    onpick,
    ondropfiles,
    width = 0,
    height = 0,
    fit = 'both',
  }: {
    onpick?: (index: number) => void;
    ondropfiles?: (files: File[], at: number) => void;
    /** The room the pages have (their scrolling column). */
    width?: number;
    height?: number;
    fit?: 'both' | 'width';
  } = $props();

  const g = $derived(sheet.geometry);
  const pages = $derived(Array.from({ length: sheet.pageCount }, (_, p) => p));

  // Pixels per millimetre: the whole page in view where there's room, never larger than ~A4 at
  // 820 px wide.
  const PAD = 24;
  const HEAD = 34;
  const scale = $derived.by(() => {
    if (!width || !g.pw) return 2.4;
    const byWidth = (width - PAD * 2) / g.pw;
    const byHeight = (height - PAD * 2 - HEAD) / g.ph;
    return Math.max(0.8, Math.min(3.9, fit === 'width' ? byWidth : Math.min(byWidth, byHeight)));
  });

  const srcOf = (c: Card) => (c.file ? fileUrl(c.file) : pictureOf(c));

  // Carrying a card: where it came from, the slot under the pointer, and the picture that follows
  // the pointer (`carry`, moved by transform once per frame).
  let dragFrom = $state<number | null>(null);
  let dropAt = $state<number | null>(null);
  let carry = $state<{ src?: string; filter: string; w: number; h: number; x: number; y: number } | null>(null);
  let ghost: HTMLElement | undefined = $state();
  let press: { from: number; id: number; x0: number; y0: number; dx: number; dy: number; el: HTMLElement } | null = null;
  let frame = 0;
  let swallowClick = false;
  /** How far the pointer moves before a press becomes a drag; a click stays a click. */
  const SLOP = 5;

  function pointerDown(e: PointerEvent, i: number) {
    const card = sheet.slots[i];
    if (!card || e.button !== 0 || e.pointerType === 'touch') return;
    const el = e.currentTarget as HTMLElement;
    const box = el.getBoundingClientRect();
    press = { from: i, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - box.left, dy: e.clientY - box.top, el };
    addEventListener('pointermove', pointerMove);
    addEventListener('pointerup', pointerUp);
    addEventListener('pointercancel', endDrag);
    addEventListener('keydown', escape);
  }

  function pointerMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    if (dragFrom == null) {
      if (Math.hypot(e.clientX - press.x0, e.clientY - press.y0) < SLOP) return;
      const card = sheet.slots[press.from];
      if (!card) return endDrag();
      const box = press.el.getBoundingClientRect();
      dragFrom = press.from;
      carry = { src: srcOf(card), filter: filterFor(sheet.styleOf(card)), w: box.width, h: box.height, x: box.left, y: box.top };
      document.documentElement.classList.add('carrying');
    }
    const { clientX: x, clientY: y } = e;
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (ghost && press) ghost.style.transform = `translate3d(${x - press.dx}px, ${y - press.dy}px, 0) rotate(-3deg)`;
      // The picture follows the pointer with pointer-events off, so this finds the slot beneath it.
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]');
      dropAt = under ? Number(under.dataset.slot) : null;
    });
  }

  function pointerUp(e: PointerEvent) {
    if (!press || e.pointerId !== press.id) return;
    if (dragFrom != null) {
      const under = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-slot]');
      const to = under ? Number(under.dataset.slot) : null;
      if (to != null && to !== dragFrom) sheet.move(dragFrom, to);
      // The release over a slot still clicks whatever is under it; that isn't a pick.
      swallowClick = true;
      setTimeout(() => (swallowClick = false));
    }
    endDrag();
  }

  function escape(e: KeyboardEvent) {
    if (e.key === 'Escape' && dragFrom != null) endDrag();
  }

  function endDrag() {
    cancelAnimationFrame(frame);
    press = null;
    dragFrom = null;
    dropAt = null;
    carry = null;
    document.documentElement.classList.remove('carrying');
    removeEventListener('pointermove', pointerMove);
    removeEventListener('pointerup', pointerUp);
    removeEventListener('pointercancel', endDrag);
    removeEventListener('keydown', escape);
  }

  $effect(() => endDrag);

  // Pictures from the desktop still come by the browser's drag and drop.
  function fileOver(e: DragEvent, i: number) {
    if (!e.dataTransfer?.types.includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    dropAt = i;
  }

  function fileDrop(e: DragEvent, i: number) {
    e.preventDefault();
    dropAt = null;
    if (e.dataTransfer?.files.length) ondropfiles?.([...e.dataTransfer.files], i);
  }

  function remove(i: number) {
    sheet.remove(i);
    toast(t('toast.removed'), { action: { label: t('toast.undo'), run: () => sheet.undo() } });
  }

  function removePage(p: number) {
    const had = sheet.page(p).some(Boolean);
    sheet.removePage(p);
    if (had) toast(t('toast.pageRemoved'), { action: { label: t('toast.undo'), run: () => sheet.undo() } });
  }

  function addPage() {
    const first = sheet.addPage();
    sheet.select(first);
    requestAnimationFrame(() => focusSlot(first, true));
  }

  function focusSlot(i: number, scroll = false) {
    const el = document.querySelector<HTMLElement>(`[data-slot="${i}"]`);
    el?.focus({ preventScroll: !scroll });
    if (scroll) el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /** Arrow keys walk the grid (on to the next page past the last row), Delete empties a slot. */
  function key(e: KeyboardEvent, i: number) {
    const { cols, perPage } = g;
    let next: number | null = null;
    if (e.key === 'ArrowRight') next = i + 1;
    else if (e.key === 'ArrowLeft') next = i - 1;
    else if (e.key === 'ArrowDown') next = i + cols;
    else if (e.key === 'ArrowUp') next = i - cols;
    else if ((e.key === 'Delete' || e.key === 'Backspace') && sheet.slots[i]) {
      e.preventDefault();
      remove(i);
      return;
    } else if (e.key === 'Home') next = Math.floor(i / perPage) * perPage;
    else if (e.key === 'End') next = Math.floor(i / perPage) * perPage + perPage - 1;
    if (next == null) return;
    e.preventDefault();
    if (next < 0 || next >= sheet.slots.length) return;
    sheet.select(next);
    focusSlot(next, true);
  }

  // A card that was just placed eases in; the rest of the sheet stays still.
  let fresh = $state<Set<string>>(new Set());
  let known = new Set<string>();
  $effect(() => {
    const now = new Set(sheet.slots.filter(Boolean).map((c) => c!.uid));
    untrack(() => {
      const added = [...now].filter((u) => !known.has(u));
      if (known.size && added.length) {
        fresh = new Set(added);
        setTimeout(() => (fresh = new Set()), 400);
      }
      known = now;
    });
  });

  /** Pages with a card are printed; the first of them starts without a page break before it. */
  const printed = $derived(pages.filter((p) => sheet.page(p).some(Boolean)));
</script>

<div class="pages" style:--mm="{scale}px">
  {#if !g.perPage}
    <p class="toobig">{t('setup.tooBig', { paper: PAPERS[sheet.setup.paper].label })}</p>
  {/if}
  {#each pages as p (p)}
    {@const slots = sheet.page(p)}
    <section class="page" class:blank={!printed.includes(p)} class:first-printed={printed[0] === p} style:--pw={g.pw} style:--ph={g.ph}>
      <header class="page-head">
        <span class="ewo-mono">{t('page.label', { n: p + 1, total: pages.length })}</span>
        {#if pages.length > 1}
          <button type="button" class="icon" title={t('page.remove', { n: p + 1 })} aria-label={t('page.remove', { n: p + 1 })} onclick={() => removePage(p)}>
            <Trash size={14} aria-hidden="true" />
          </button>
        {/if}
      </header>
      <div class="paper">
        <svg class="guides" viewBox="0 0 {g.pw} {g.ph}" aria-hidden="true">
          {#each g.marks as m, k (k)}
            <line x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} />
          {/each}
          {#if g.ruler}
            {@const r = g.ruler}
            <g class="ruler">
              <line x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
              <line x1={r.x1} y1={r.y1 - 0.9} x2={r.x1} y2={r.y1 + 0.9} />
              <line x1={r.x2} y1={r.y1 - 0.9} x2={r.x2} y2={r.y1 + 0.9} />
              <text x={(r.x1 + r.x2) / 2} y={r.y1 + 3.1}>50 mm</text>
            </g>
          {/if}
        </svg>
        {#each g.cells as cell, c (c)}
          {@const i = p * g.perPage + c}
          {@const card = slots[c]}
          <div
            role="presentation"
            class="slot"
            class:filled={!!card}
            class:selected={sheet.selected === i}
            class:dragging={dragFrom === i}
            class:over={dropAt === i && dragFrom !== i}
            class:fresh={!!card && fresh.has(card.uid)}
            style:left="calc({cell.x} * var(--mm))"
            style:top="calc({cell.y} * var(--mm))"
            style:width="calc({g.cw} * var(--mm))"
            style:height="calc({g.ch} * var(--mm))"
            ondragover={(e) => fileOver(e, i)}
            ondragleave={() => dropAt === i && (dropAt = null)}
            ondrop={(e) => fileDrop(e, i)}
          >
            <button
              type="button"
              class="hit"
              data-slot={i}
              tabindex={sheet.selected === i || (sheet.selected == null && i === 0) ? 0 : -1}
              aria-pressed={sheet.selected === i}
              aria-label={card ? t('slot.card', { name: card.name, n: c + 1 }) : t('slot.empty', { n: c + 1 })}
              onpointerdown={(e) => pointerDown(e, i)}
              onclick={() => {
                if (swallowClick) return;
                sheet.select(i);
                onpick?.(i);
              }}
              onkeydown={(e) => key(e, i)}
            >
              {#if card}
                {@const src = srcOf(card)}
                {#if src}
                  <img src={src} alt="" draggable="false" use:retry style:filter={filterFor(sheet.styleOf(card))} />
                {/if}
                {#if card.tag || card.note}
                  <!-- The language the proxy stands for, printed on its face so it survives the cut. -->
                  <span class="badge">{badgeText(card.tag, card.note)}</span>
                {/if}
              {:else}
                <span class="empty" aria-hidden="true">
                  <Plus size={18} strokeWidth={1.5} />
                  <span class="n ewo-mono">{c + 1}</span>
                </span>
              {/if}
            </button>
            {#if card && sheet.selected === i}
              <button type="button" class="remove" title={t('card.remove')} aria-label={t('card.remove')} onclick={() => remove(i)}>
                <X size={13} strokeWidth={2.4} aria-hidden="true" />
              </button>
            {/if}
          </div>
        {/each}
      </div>
    </section>
  {/each}
  {#if carry}
    <div
      class="ghost"
      bind:this={ghost}
      style:width="{carry.w}px"
      style:height="{carry.h}px"
      style:transform="translate3d({carry.x}px, {carry.y}px, 0) rotate(-3deg)"
      aria-hidden="true"
    >
      {#if carry.src}<img src={carry.src} alt="" style:filter={carry.filter} />{/if}
    </div>
  {/if}
  {#if g.perPage}
    <button type="button" class="add-page" onclick={addPage}>
      <Plus size={15} aria-hidden="true" />
      {t('page.add')}
    </button>
  {/if}
</div>

<style>
  .pages {
    display: grid;
    justify-items: center;
    align-content: start;
    gap: 1.75rem;
    padding: 24px 24px 3rem;
    min-height: 100%;
    box-sizing: border-box;
  }

  .page {
    display: grid;
    gap: 0.5rem;
    width: calc(var(--pw) * var(--mm));
  }

  .page-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 26px;
    color: var(--ewo-fg-3);
  }

  .page-head .ewo-mono {
    font-size: var(--ewo-text-2xs);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .icon {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border: 0;
    border-radius: var(--ewo-r-xs);
    background: none;
    color: var(--ewo-fg-3);
  }

  .icon:hover {
    background: var(--ewo-fill-2);
    color: var(--ewo-fg);
  }

  /* Paper is white whatever the theme: it's what comes out of the printer. */
  .paper {
    position: relative;
    width: calc(var(--pw) * var(--mm));
    height: calc(var(--ph) * var(--mm));
    background: #fff;
    border-radius: 2px;
    box-shadow:
      0 0 0 1px light-dark(rgb(0 0 0 / 0.06), rgb(255 255 255 / 0.04)),
      0 1px 2px light-dark(rgb(40 36 30 / 0.08), rgb(0 0 0 / 0.4)),
      0 12px 32px -8px light-dark(rgb(40 36 30 / 0.16), rgb(0 0 0 / 0.6));
    color: #111;
  }

  /* A touch less glare on a dark page. */
  .paper {
    background: light-dark(#fff, #f2f2ee);
  }

  .guides {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .guides line {
    stroke: #8a8a8a;
    stroke-width: 1px;
    vector-effect: non-scaling-stroke;
  }

  .ruler text {
    font: 500 1.9px var(--ewo-mono);
    fill: #8a8a8a;
    text-anchor: middle;
  }

  .slot {
    position: absolute;
  }

  /* The selected slot (and one with keyboard focus) sits above its neighbours, so its outline isn't
     covered by the card beside it when two cards touch. */
  .slot.selected,
  .slot:focus-within,
  .slot.over {
    z-index: 2;
  }

  .slot.filled .hit {
    cursor: grab;
  }

  :global(html.carrying),
  :global(html.carrying *) {
    cursor: grabbing !important;
    user-select: none;
  }

  .hit {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    padding: 0;
    border: 0;
    background: none;
    border-radius: 3.5% / 2.5%;
    cursor: pointer;
  }

  .slot:not(.filled) .hit {
    /* A hairline on the paper, inset so neighbours with no gap don't double it. */
    background: rgb(0 0 0 / 0.012);
    box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.09);
    border-radius: 2px;
    transition: background var(--ewo-dur-1) ease;
  }

  .slot:not(.filled) .hit:hover {
    background: rgb(0 0 0 / 0.035);
  }

  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: rgb(0 0 0 / 0.22);
  }

  .n {
    position: absolute;
    top: 6%;
    left: 8%;
    font-size: max(9px, calc(2.4 * var(--mm)));
    font-weight: 500;
  }

  .slot.selected:not(.filled) .hit {
    background: color-mix(in oklab, var(--ewo-project-pokeproxy) 9%, transparent);
    box-shadow: inset 0 0 0 2px var(--ewo-project-pokeproxy);
  }

  .slot.selected:not(.filled) .empty {
    color: var(--ewo-project-pokeproxy);
  }

  .slot.over .hit {
    background: color-mix(in oklab, var(--ewo-project-pokeproxy) 14%, transparent);
    box-shadow: inset 0 0 0 2px var(--ewo-project-pokeproxy);
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    user-select: none;
  }

  .slot.filled.selected .hit {
    outline: 2px solid var(--ewo-project-pokeproxy);
    outline-offset: 2px;
  }

  /* Above the card's bottom line (its number, the illustrator), over the weakness bar's edge. */
  .badge {
    position: absolute;
    left: 50%;
    bottom: calc(7.5 * var(--mm));
    translate: -50% 0;
    max-width: 88%;
    overflow: hidden;
    padding: calc(0.45 * var(--mm)) calc(1.5 * var(--mm));
    border-radius: 999px;
    background: rgb(17 17 17 / 0.86);
    color: #fff;
    font: 600 calc(2.2 * var(--mm)) / 1.25 var(--ewo-sans);
    letter-spacing: 0.01em;
    white-space: nowrap;
    text-overflow: ellipsis;
    pointer-events: none;
  }

  .slot.dragging {
    opacity: 0.35;
  }

  /* A card carried onto another swaps with it. */
  .slot.filled.over .hit {
    outline: 2px dashed var(--ewo-project-pokeproxy);
    outline-offset: 2px;
  }

  .ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 60;
    border-radius: 3.5% / 2.5%;
    overflow: hidden;
    pointer-events: none;
    box-shadow: 0 14px 32px -6px rgb(0 0 0 / 0.35);
    will-change: transform;
  }

  .ghost img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .slot.fresh img {
    animation: arrive 320ms var(--ewo-ease) both;
  }

  @keyframes arrive {
    from {
      opacity: 0;
      transform: scale(0.94);
    }
  }

  .remove {
    position: absolute;
    top: -9px;
    right: -9px;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: var(--ewo-fg);
    color: var(--ewo-bg);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.3);
    z-index: 2;
  }

  .remove:hover {
    background: var(--ewo-bad);
    color: #fff;
  }

  .hit:focus-visible {
    outline: 2px solid var(--ewo-fg-2);
    outline-offset: 2px;
  }

  .add-page {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 0.9rem;
    border: 1px dashed var(--ewo-line-strong);
    border-radius: var(--ewo-r-pill);
    background: none;
    font-size: var(--ewo-text-sm);
    color: var(--ewo-fg-2);
  }

  .add-page:hover {
    border-style: solid;
    color: var(--ewo-fg);
  }

  .toobig {
    color: var(--ewo-bad);
    font-size: var(--ewo-text-sm);
  }

  @media (prefers-reduced-motion: reduce) {
    .slot.fresh img {
      animation: none;
    }
  }

  /* The printer's version: real millimetres, only the paper, only pages with a card. */
  @media print {
    .pages {
      --mm: 1mm !important;
      display: block;
      padding: 0;
      min-height: 0;
    }

    .page {
      display: block;
      width: auto;
      break-inside: avoid;
    }

    .page:not(.first-printed) {
      break-before: page;
    }

    .page.blank,
    .page-head,
    .add-page,
    .ghost,
    .remove,
    .toobig {
      display: none !important;
    }

    /* A hair under the paper's height, so rounding never spills a blank page after it. */
    .paper {
      height: calc((var(--ph) - 0.4) * 1mm);
      overflow: hidden;
      border-radius: 0;
      box-shadow: none !important;
      background: #fff !important;
    }

    .guides line {
      stroke: #666;
      stroke-width: 0.2;
      vector-effect: none;
    }

    .slot:not(.filled) {
      display: none;
    }

    .slot .hit {
      outline: none !important;
      box-shadow: none !important;
    }

    .slot.fresh img {
      animation: none;
    }
  }
</style>
