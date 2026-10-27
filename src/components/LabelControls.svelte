<!--
  A label's look, size, tilt and place: the sheet's, which every card follows (Setup), or one card's
  own (the card's Own label row). The handles on the card do the same by dragging.
-->
<script lang="ts">
  import { LABEL_ANGLE, LABEL_SIZE, type Label, type LabelLook } from '../lib/layout.ts';
  import { mm, t } from '../lib/i18n/index.svelte.ts';

  let { label, onchange }: { label: Label; onchange: (patch: Partial<Label>) => void } = $props();

  const PLACES = { top: 0.18, middle: 0.5, bottom: 0.82 } as const;
</script>

<div class="controls">
  <ewo-segmented size="sm" stretch label={t('label.look')} value={label.look} onchange={(e) => onchange({ look: e.detail.value as LabelLook })}>
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
        oninput={(e) => onchange({ size: e.detail.value })}
        onchange={(e) => onchange({ size: e.detail.value })}
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
        oninput={(e) => onchange({ angle: e.detail.value })}
        onchange={(e) => onchange({ angle: e.detail.value })}
      ></ewo-slider>
    </div>
  </div>
  <div class="places" role="group" aria-label={t('label.place')}>
    {#each Object.entries(PLACES) as [name, y] (name)}
      <button
        type="button"
        class="chip"
        class:on={Math.abs(label.y - y) < 0.02 && Math.abs(label.x - 0.5) < 0.02}
        onclick={() => onchange({ x: 0.5, y })}>{t(`place.${name}` as 'place.top')}</button
      >
    {/each}
  </div>
</div>

<style>
  .controls {
    display: grid;
    gap: 0.65rem;
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

  /* Folio's slider asks for 120 px; two side by side in the setup column get about 108. */
  .ctl ewo-slider {
    min-width: 0;
  }

  .row {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
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
    gap: 0.35rem;
  }

  .chip {
    height: 1.8rem;
    padding: 0 0.7rem;
    border: 1px solid var(--ewo-line);
    border-radius: var(--ewo-r-pill);
    background: none;
    font-size: var(--ewo-text-xs);
    color: var(--ewo-fg-2);
  }

  .chip:hover {
    color: var(--ewo-fg);
    border-color: var(--ewo-line-strong);
  }

  .chip.on {
    border-color: var(--ewo-project-pokeproxy);
    background: color-mix(in oklab, var(--ewo-project-pokeproxy) 12%, transparent);
    color: var(--ewo-fg);
  }
</style>
