<script>
  /**
   * @component Audio
   * Native audio player with optional title label.
   *
   * @prop {string} src - Audio file URL (supports $assets/ paths)
   * @prop {string} title - Accessible label for the player (required; rule 1.4)
   * @prop {Array<{ src: string, kind?: 'captions'|'subtitles', srclang?: string, label?: string }>} [tracks] -
   *   Caption/subtitle tracks rendered as <track> on the native player.
   * @prop {string} [transcript] - Transcript text (or $assets/ path) shown in a
   *   <details> disclosure below the player (WCAG 1.2.1).
   */
  import { resolveAsset } from './util.js';

  let { src, title, tracks = [], transcript = '' } = $props();
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
    {#each tracks as track (track.src)}
      <track
        src={resolveAsset(track.src)}
        kind={track.kind ?? 'captions'}
        srclang={track.srclang}
        label={track.label}
      />
    {/each}
    Your browser does not support the audio element.
  </audio>
  {#if transcript}
    <details class="tessera-audio-transcript">
      <summary>Transcript</summary>
      <div class="tessera-audio-transcript-body">{transcript}</div>
    </details>
  {/if}
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

  .tessera-audio-transcript {
    margin-top: var(--tessera-spacing-sm);
    font-size: 0.875rem;
  }

  .tessera-audio-transcript summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--tessera-text);
  }

  .tessera-audio-transcript-body {
    margin-top: var(--tessera-spacing-sm);
    color: var(--tessera-text-light);
    white-space: pre-line;
  }
</style>
