<!--
  Pictures from this computer: dropped here or onto a slot on the sheet, or chosen. They stay on
  the device (IndexedDB) and never go to the server. Several fill the slots from the selected one on.
-->
<script lang="ts">
  import Upload from '@lucide/svelte/icons/image-up';
  import { placeFilesWithNote } from '../lib/actions.svelte.ts';
  import { t } from '../lib/i18n/index.svelte.ts';

  let over = $state(false);

  function chosen(e: Event & { currentTarget: HTMLInputElement }) {
    const files = [...(e.currentTarget.files ?? [])];
    e.currentTarget.value = '';
    if (files.length) void placeFilesWithNote(files);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    over = false;
    const files = [...(e.dataTransfer?.files ?? [])];
    if (files.length) void placeFilesWithNote(files);
  }
</script>

<div class="upload">
  <label
    class="zone"
    class:over
    ondragover={(e) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      over = true;
    }}
    ondragleave={() => (over = false)}
    ondrop={drop}
  >
    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" multiple onchange={chosen} />
    <Upload size={22} strokeWidth={1.6} aria-hidden="true" />
    <span class="drop">{t('upload.drop')}</span>
    <span class="choose">{t('upload.choose')}</span>
  </label>
  <p class="hint">{t('upload.hint')}</p>
</div>

<style>
  .upload {
    display: grid;
    gap: 0.6rem;
  }

  .zone {
    position: relative;
    display: grid;
    justify-items: center;
    gap: 0.4rem;
    padding: 2rem 1rem;
    border: 1.5px dashed var(--ewo-line-strong);
    border-radius: var(--ewo-r-md);
    color: var(--ewo-fg-3);
    text-align: center;
    cursor: pointer;
    transition:
      background var(--ewo-dur-1) ease,
      border-color var(--ewo-dur-1) ease;
  }

  .zone:hover,
  .zone.over {
    border-color: var(--ewo-project-pokeproxy);
    background: color-mix(in oklab, var(--ewo-project-pokeproxy) 6%, transparent);
    color: var(--ewo-fg-2);
  }

  .zone:focus-within {
    outline: var(--ewo-focus);
    outline-offset: 3px;
  }

  input {
    position: absolute;
    inset: 0;
    opacity: 0;
    cursor: pointer;
  }

  .drop {
    font-size: var(--ewo-text-md);
    font-weight: 500;
    color: var(--ewo-fg);
  }

  .choose {
    font-size: var(--ewo-text-sm);
    text-decoration: underline;
    text-underline-offset: 3px;
    text-decoration-color: var(--ewo-line-strong);
  }

  .hint {
    margin: 0;
    font-size: var(--ewo-text-xs);
    line-height: 1.5;
    color: var(--ewo-fg-3);
  }
</style>
