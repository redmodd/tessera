<script>
  /**
   * @component Audio
   * Native audio player with optional title label.
   *
   * @prop {string} src - Audio file URL (supports $assets/ paths)
   * @prop {string} [title] - Label displayed above the player
   */
  import { resolveAsset } from './util.js';

  let { src, title = '' } = $props();
  let resolvedSrc = $derived(resolveAsset(src));
</script>

<div class="tessera-audio">
  {#if title}
    <div class="tessera-audio-title">{title}</div>
  {/if}
  <audio
    controls
    preload="metadata"
    aria-label={title || 'Audio player'}
    class="tessera-audio-player"
  >
    <source src={resolvedSrc} />
    Your browser does not support the audio element.
  </audio>
</div>

<style>
  .tessera-audio {
    margin-bottom: var(--tessera-spacing-lg);
  }

  .tessera-audio-title {
    font-size: 0.875rem;
    font-weight: 600;
    color: var(--tessera-text);
    margin-bottom: var(--tessera-spacing-sm);
  }

  .tessera-audio-player {
    width: 100%;
    display: block;
  }
</style>
