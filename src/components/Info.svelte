<!--
  The (i) after a heading in the setup: its hint shows under the heading while the pointer rests on
  it or the keyboard is on it, and a click or a tap keeps it there until the next one. It keeps the
  setup inside the window.
-->
<script lang="ts">
  import InfoIcon from '@lucide/svelte/icons/info';

  let { about, open = $bindable(false) }: { about: string; open?: boolean } = $props();

  let hovering = false;
  let focused = false;
  let pinned = false;
  const sync = () => (open = hovering || focused || pinned);

  function click() {
    // A click on a hint that's showing keeps it; a click on a kept one puts it away, pointer or not.
    if (pinned) pinned = hovering = focused = false;
    else pinned = true;
    sync();
  }
</script>

<button
  type="button"
  class="info"
  class:open
  aria-label={about}
  aria-expanded={open}
  onpointerenter={(e) => e.pointerType === 'mouse' && ((hovering = true), sync())}
  onpointerleave={() => ((hovering = false), sync())}
  onfocus={(e) => e.currentTarget.matches(':focus-visible') && ((focused = true), sync())}
  onblur={() => ((focused = false), sync())}
  onclick={click}
>
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
