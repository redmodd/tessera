<script>
  /**
   * @component Audio
   * Native audio player with optional title label.
   *
   * @prop {string} src - Audio file URL (supports $assets/ paths)
   * @prop {string} title - Accessible label for the player (required; rule 1.4)
   * @prop {Array<{ src: string, kind?: 'captions'|'subtitles', srclang?: string, label?: string }>} [tracks] -
   *   Caption/subtitle tracks rendered as <track> on the native player.
   * @prop {string} [transcript] - Transcript text shown in a <details> disclosure
   *   below the player (WCAG 1.2.1). To load it from a file, import the file with
   *   Vite's ?raw suffix: `import t from '$assets/x.txt?raw'` then `transcript={t}`.
   */
  import { resolveAsset } from './util.js';
  import MediaTracks from './MediaTracks.svelte';
  import Transcript from './Transcript.svelte';

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
    <MediaTracks {tracks} />
    Your browser does not support the audio element.
  </audio>
  <Transcript text={transcript} />
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
