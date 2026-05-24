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
  let open = $state(false);
  let modalRef = $state(null);
  let previousFocus = null;

  function openModal() {
    previousFocus = document.activeElement;
    open = true;
  }

  function closeModal() {
    open = false;
    if (previousFocus && typeof previousFocus.focus === 'function') {
      previousFocus.focus();
    }
  }

  function handleOverlayClick(e) {
    if (e.target === e.currentTarget) {
      closeModal();
    }
  }

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    // Focus trap
    if (e.key === 'Tab' && modalRef) {
      const focusable = modalRef.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  }

  $effect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      // Focus the modal after render
      queueMicrotask(() => {
        if (modalRef) {
          const firstFocusable = modalRef.querySelector(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          );
          if (firstFocusable) firstFocusable.focus();
          else modalRef.focus();
        }
      });
    } else {
      document.body.style.overflow = '';
    }
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tessera-reveal-trigger" onclick={openModal}>
  {@render trigger()}
</div>

{#if open}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="tessera-modal-overlay"
    onclick={handleOverlayClick}
    onkeydown={handleKeydown}
  >
    <div
      class="tessera-modal-content"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Modal'}
      bind:this={modalRef}
      tabindex="-1"
    >
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
  </div>
{/if}

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

  .tessera-modal-overlay {
    position: fixed;
    inset: 0;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: var(--tessera-spacing-lg);
    animation: tessera-modal-fade-in 200ms ease;
  }

  .tessera-modal-content {
    position: relative;
    background: var(--tessera-bg);
    border-radius: 12px;
    padding: var(--tessera-spacing-xl);
    max-width: 600px;
    width: 100%;
    max-height: 80vh;
    overflow-y: auto;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    animation: tessera-modal-slide-in 200ms ease;
  }

  .tessera-modal-content:focus {
    outline: none;
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
    .tessera-modal-content {
      max-height: 90vh;
      border-radius: 12px 12px 0 0;
      align-self: flex-end;
    }
  }
</style>
