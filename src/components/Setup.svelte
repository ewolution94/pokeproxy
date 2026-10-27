<!--
  The sheet's setup, top to bottom in the order you'd decide it: the paper, the card's size, the
  space between cards, the cut marks and the scale check, the print style, and the labels every
  card follows. The readout under the card size says what fits ("3 × 3: 9 cards a page"). The hints
  sit behind an (i) each, so the column fits a laptop's window. A column on wide screens, a sheet
  otherwise.
-->
<script lang="ts">
  import Info from './Info.svelte';
  import LabelControls from './LabelControls.svelte';
  import { DEFAULT_LABEL, PAPERS, type PaperId, type PrintStyle } from '../lib/layout.ts';
  import { sheet } from '../lib/sheet.svelte.ts';
  import { mm, t, tn } from '../lib/i18n/index.svelte.ts';
  import { toast } from '../../vendor/ewo/elements/toaster.js';

  const g = $derived(sheet.geometry);
  const s = $derived(sheet.setup);
  const tips = $state({ card: false, gap: false, style: false, labels: false });

  function size(which: 'w' | 'h', value: string) {
    const n = Number(value.replace(',', '.'));
    if (Number.isFinite(n) && n >= 20 && n <= 400) sheet.change({ [which]: Math.round(n * 10) / 10 });
  }

  function clear() {
    if (!sheet.cardCount) return;
    sheet.clear();
    toast(t('toast.cleared'), { action: { label: t('toast.undo'), run: () => sheet.undo() } });
  }
</script>

<div class="setup">
  <section>
    <label class="label" for="paper">{t('setup.paper')}</label>
    <div class="row">
      <select id="paper" value={s.paper} onchange={(e) => sheet.change({ paper: e.currentTarget.value as PaperId })}>
        {#each Object.entries(PAPERS) as [id, p] (id)}
          <option value={id}>{p.label} · {p.w} × {p.h} mm</option>
        {/each}
      </select>
    </div>
    <ewo-segmented
      size="sm"
      stretch
      label={t('setup.orientation')}
      value={s.landscape ? 'landscape' : 'portrait'}
      onchange={(e) => sheet.change({ landscape: e.detail.value === 'landscape' })}
    >
      <option value="portrait">{t('setup.portrait')}</option>
      <option value="landscape">{t('setup.landscape')}</option>
    </ewo-segmented>
  </section>

  <section>
    <div class="head">
      <h3 class="label">{t('setup.card')}</h3>
      {#if !s.custom}<Info about={t('setup.about', { what: t('setup.card') })} bind:open={tips.card} />{/if}
    </div>
    <ewo-segmented size="sm" stretch label={t('setup.card')} value={s.custom ? 'custom' : 'standard'} onchange={(e) => sheet.change({ custom: e.detail.value === 'custom' })}>
      <option value="standard">{t('setup.standard')}</option>
      <option value="custom">{t('setup.custom')}</option>
    </ewo-segmented>
    {#if s.custom}
      <div class="dims">
        <label>
          <span>{t('setup.width')}</span>
          <input type="number" inputmode="decimal" min="20" max="400" step="0.5" value={s.w} onchange={(e) => size('w', e.currentTarget.value)} />
          <span class="unit">mm</span>
        </label>
        <span class="times" aria-hidden="true">×</span>
        <label>
          <span>{t('setup.height')}</span>
          <input type="number" inputmode="decimal" min="20" max="400" step="0.5" value={s.h} onchange={(e) => size('h', e.currentTarget.value)} />
          <span class="unit">mm</span>
        </label>
      </div>
    {:else if tips.card}
      <p class="hint">{t('setup.standardHint')}</p>
    {/if}
    {#if g.perPage}
      <p class="fits ewo-mono">{tn('setup.fits', g.perPage, { cols: g.cols, rows: g.rows })}</p>
    {:else}
      <p class="fits bad">{t('setup.tooBig', { paper: PAPERS[s.paper].label })}</p>
    {/if}
  </section>

  <section>
    <div class="head">
      <h3 class="label">{t('setup.gap')}</h3>
      <Info about={t('setup.about', { what: t('setup.gap') })} bind:open={tips.gap} />
      <span class="value ewo-mono">{mm(s.gap)}</span>
    </div>
    {#if tips.gap}<p class="hint">{t('setup.gapHint')}</p>{/if}
    <!-- Folio's shared slider (Randomiser's): the page reflows as it's dragged. -->
    <ewo-slider
      label={t('setup.gap')}
      min={0}
      max={5}
      step={0.5}
      value={s.gap}
      format={(v: number) => mm(v)}
      ticks
      oninput={(e) => sheet.change({ gap: e.detail.value })}
      onchange={(e) => sheet.change({ gap: e.detail.value })}
    ></ewo-slider>
  </section>

  <section class="switches">
    <ewo-switch row checked={s.marks} onchange={(e) => sheet.change({ marks: e.detail.checked })}>{t('setup.marks')}</ewo-switch>
    <ewo-switch row checked={s.ruler} title={t('setup.rulerHint')} onchange={(e) => sheet.change({ ruler: e.detail.checked })}>
      {t('setup.ruler')}
      <span slot="hint">{t('setup.rulerShort')}</span>
    </ewo-switch>
  </section>

  <section>
    <div class="head">
      <h3 class="label">{t('setup.style')}</h3>
      <Info about={t('setup.about', { what: t('setup.style') })} bind:open={tips.style} />
    </div>
    {#if tips.style}<p class="hint">{t('setup.printTip')}</p>{/if}
    <ewo-segmented size="sm" stretch label={t('setup.style')} value={s.style} onchange={(e) => sheet.change({ style: e.detail.value as PrintStyle })}>
      <option value="colour">{t('style.colour')}</option>
      <option value="grey">{t('style.grey')}</option>
      <option value="light">{t('style.light')}</option>
    </ewo-segmented>
  </section>

  <section aria-labelledby="labels-title">
    <div class="head">
      <h3 class="label" id="labels-title">{t('setup.labels')}</h3>
      <Info about={t('setup.about', { what: t('setup.labels') })} bind:open={tips.labels} />
      <button type="button" class="link" onclick={() => sheet.setSheetLabel(DEFAULT_LABEL)}>{t('label.reset')}</button>
    </div>
    {#if tips.labels}<p class="hint">{t('setup.labelsHint')} {t('label.hint')}</p>{/if}
    <LabelControls label={s.label} onchange={(patch) => sheet.setSheetLabel(patch)} />
  </section>

  <section class="end">
    <button type="button" class="quiet danger" disabled={!sheet.cardCount} onclick={clear}>{t('setup.clear')}</button>
  </section>
</div>

<style>
  .setup {
    display: grid;
    gap: 0;
  }

  section {
    display: grid;
    gap: 0.6rem;
    padding-block: 1rem;
  }

  section + section {
    border-top: 1px solid var(--ewo-line-2);
  }

  section:first-child {
    padding-top: 0.25rem;
  }


  select,
  input {
    font: inherit;
    font-size: var(--ewo-text-sm);
    color: var(--ewo-fg);
    background: var(--ewo-bg-raised);
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-xs);
    height: 2.25rem;
  }

  select {
    width: 100%;
    padding: 0 0.6rem;
  }

  .dims {
    display: flex;
    align-items: end;
    gap: 0.5rem;
  }

  .dims label {
    position: relative;
    display: grid;
    gap: 0.3rem;
    flex: 1;
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg-3);
  }

  .dims input {
    width: 100%;
    padding: 0 2.2rem 0 0.6rem;
    font-family: var(--ewo-mono);
    font-variant-numeric: tabular-nums;
  }

  .unit {
    position: absolute;
    right: 0.6rem;
    bottom: 0.6rem;
    font-family: var(--ewo-mono);
    font-size: var(--ewo-text-2xs);
    color: var(--ewo-fg-3);
    pointer-events: none;
  }

  .times {
    padding-bottom: 0.55rem;
    color: var(--ewo-fg-3);
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 1.1rem;
  }

  .head .label {
    margin: 0;
  }

  .value,
  .link {
    margin-left: auto;
  }

  .value {
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg);
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

  .hint {
    margin: 0;
    font-size: var(--ewo-text-xs);
    line-height: 1.45;
    color: var(--ewo-fg-3);
  }

  .fits {
    margin: 0;
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg);
  }

  .fits.bad {
    color: var(--ewo-bad);
  }

  .switches {
    gap: 0.9rem;
  }

  .end {
    display: flex;
    padding-bottom: 0;
  }

  .quiet {
    border: 0;
    background: none;
    padding: 0.35rem 0;
    font-size: var(--ewo-text-sm);
    color: var(--ewo-fg-2);
  }

  .quiet.danger:not(:disabled):hover {
    color: var(--ewo-bad);
  }

  .quiet:disabled {
    color: var(--ewo-fg-4);
    cursor: default;
  }
</style>
