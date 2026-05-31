<script>
  /**
   * @component RevealModal
   * Modal overlay triggered by user-defined trigger snippet.
   *
   * @prop {string} [title] - Modal label for accessibility
   * @prop {import('svelte').Snippet} trigger - Trigger content snippet
   * @prop {import('svelte').Snippet} content - Modal body snippet
   */
  let { trigger, content, title = '' } = $props();
  let dialogRef = $state(null);

  function openModal() {
    dialogRef?.showModal();
  }

  function closeModal() {
    dialogRef?.close();
  }

  // A click whose target is the dialog element itself (not its content) is a
  // backdrop click.
  function handleClick(e) {
    if (e.target === dialogRef) closeModal();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tessera-reveal-trigger" onclick={openModal}>
  {@render trigger()}
</div>

<dialog
  class="tessera-modal"
  bind:this={dialogRef}
  aria-label={title || 'Modal'}
  onclick={handleClick}
>
  <div class="tessera-modal-content">
    {#if title}
      <h2 class="tessera-modal-title">{title}</h2>
    {/if}
    <div class="tessera-modal-body">
      {@render content()}
    </div>
    <button
      class="tessera-modal-close"
      onclick={closeModal}
      aria-label="Close modal"
    >
      ✕
    </button>
  </div>
</dialog>

<style>
  .tessera-reveal-trigger {
    display: inline-block;
    cursor: pointer;
  }

  .tessera-reveal-trigger:focus-visible {
    box-shadow: var(--tessera-focus-ring);
    outline: none;
    border-radius: 4px;
  }

  .tessera-modal {
    border: none;
    padding: 0;
    background: transparent;
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    margin: auto;
  }

  .tessera-modal::backdrop {
    background-color: rgba(0, 0, 0, 0.5);
    animation: tessera-modal-fade-in 200ms ease;
  }

  .tessera-modal-content {
    position: relative;
    background: var(--tessera-bg);
    border-radius: 12px;
    padding: var(--tessera-spacing-xl);
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    animation: tessera-modal-slide-in 200ms ease;
  }

  .tessera-modal-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: var(--tessera-text);
    margin-bottom: var(--tessera-spacing-md);
    margin-top: 0;
    padding-right: var(--tessera-spacing-xl);
  }

  .tessera-modal-body :global(p:last-child) {
    margin-bottom: 0;
  }

  .tessera-modal-close {
    position: absolute;
    top: var(--tessera-spacing-md);
    right: var(--tessera-spacing-md);
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    font-size: 1.125rem;
    color: var(--tessera-text-light);
    cursor: pointer;
    border-radius: 6px;
    transition:
      background-color var(--tessera-transition-fast),
      color var(--tessera-transition-fast);
  }

  .tessera-modal-close:hover {
    background-color: var(--tessera-bg-secondary);
    color: var(--tessera-text);
  }

  .tessera-modal-close:focus-visible {
    box-shadow: var(--tessera-focus-ring);
    outline: none;
  }

  @keyframes tessera-modal-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes tessera-modal-slide-in {
    from {
      transform: translateY(10px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 640px) {
    .tessera-modal {
      max-height: 90vh;
      border-radius: 12px 12px 0 0;
      align-self: flex-end;
    }
  }
</style>
