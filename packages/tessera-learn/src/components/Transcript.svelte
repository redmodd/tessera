<script>
  /**
   * @component Transcript
   * Shared transcript disclosure for Audio/Video (WCAG 1.2). Renders nothing
   * when empty.
   *
   * @prop {string} [text] - Transcript text shown in a <details> disclosure.
   */
  let { text = '' } = $props();
</script>

{#if text}
  <details class="tessera-transcript">
    <summary>Transcript</summary>
    <div class="tessera-transcript-body">{text}</div>
  </details>
{/if}

<style>
  .tessera-transcript {
    margin-top: var(--tessera-spacing-sm);
    margin-bottom: var(--tessera-spacing-lg);
    font-size: 0.875rem;
  }

  .tessera-transcript summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--tessera-text);
  }

  .tessera-transcript-body {
    margin-top: var(--tessera-spacing-sm);
    color: var(--tessera-text-light);
    white-space: pre-line;
  }
</style>
