<!--
  The (i) after a heading in the setup: its hint is the browser's tooltip on hover, and a click or a
  tap shows it under the heading until the next one. It keeps the setup inside the window.
-->
<script lang="ts">
  import InfoIcon from '@lucide/svelte/icons/info';

  let { text, about, open = $bindable(false) }: { text: string; about: string; open?: boolean } = $props();
</script>

<button type="button" class="info" class:open title={text} aria-label={about} aria-expanded={open} onclick={() => (open = !open)}>
  <InfoIcon size={14} aria-hidden="true" />
</button>

<style>
  .info {
    display: inline-grid;
    place-items: center;
    width: 1.5rem;
    height: 1.5rem;
    margin: -0.35rem 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--ewo-fg-3);
    vertical-align: middle;
  }

  .info:hover,
  .info.open {
    color: var(--ewo-fg);
  }

  .info.open {
    background: var(--ewo-fill-2);
  }
</style>
