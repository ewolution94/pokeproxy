<!--
  A pasted link: a card page or a picture's address. The server reads it (server/link.mjs): a
  catalogue card where it knows the address, otherwise the picture itself, which this device keeps.
  A link to a whole set opens its cards in Search instead.
-->
<script lang="ts">
  import Link from '@lucide/svelte/icons/link';
  import { placeLink } from '../lib/actions.svelte.ts';
  import { t } from '../lib/i18n/index.svelte.ts';

  let url = $state('');
  let input: HTMLInputElement | undefined = $state();

  const link = $derived(placeLink.state);

  async function submit(e: SubmitEvent) {
    e.preventDefault();
    if (!url.trim() || link.busy) return;
    if (await placeLink.run(url.trim())) url = '';
    input?.focus();
  }
</script>

<form class="link" onsubmit={submit}>
  <label class="label" for="link-url">{t('link.label')}</label>
  <div class="row">
    <div class="field">
      <Link size={15} aria-hidden="true" />
      <input
        id="link-url"
        bind:this={input}
        bind:value={url}
        type="url"
        inputmode="url"
        placeholder={t('link.placeholder')}
        autocomplete="off"
        spellcheck="false"
        enterkeyhint="go"
      />
    </div>
    <button type="submit" class="go" disabled={!url.trim() || link.busy}>{t('link.go')}</button>
  </div>
  <p class="status" aria-live="polite" class:bad={!!link.error}>
    {#if link.busy}
      {t('link.working')}
    {:else if link.error}
      {link.error}
    {:else if link.placed}
      {t('link.placed', { name: link.placed })}
    {/if}
  </p>
  <p class="hint">{t('link.hint')}</p>
</form>

<style>
  .link {
    display: grid;
    gap: 0.6rem;
  }


  .row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 0.5rem;
  }

  .field {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    height: 2.35rem;
    padding: 0 0.7rem;
    border: 1px solid var(--ewo-line-strong);
    border-radius: var(--ewo-r-sm);
    background: var(--ewo-bg);
    color: var(--ewo-fg-3);
  }

  .field:focus-within {
    border-color: var(--ewo-fg-3);
  }

  .field input {
    flex: 1;
    min-width: 0;
    height: 100%;
    border: 0;
    outline: 0;
    background: none;
    font: inherit;
    font-size: var(--ewo-text-md);
    color: var(--ewo-fg);
  }

  .go {
    height: 2.35rem;
    padding: 0 1rem;
    border: 0;
    border-radius: var(--ewo-r-sm);
    background: var(--ewo-fg);
    color: var(--ewo-bg);
    font-size: var(--ewo-text-sm);
    font-weight: 500;
  }

  .go:disabled {
    opacity: 0.35;
    cursor: default;
  }

  .status {
    min-height: 1.2em;
    margin: 0;
    font-size: var(--ewo-text-xs);
    line-height: 1.5;
    color: var(--ewo-fg-2);
  }

  .status.bad {
    color: var(--ewo-bad);
  }

  .hint {
    margin: 0;
    font-size: var(--ewo-text-xs);
    line-height: 1.5;
    color: var(--ewo-fg-3);
  }
</style>
