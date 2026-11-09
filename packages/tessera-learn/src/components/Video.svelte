<script>
  /**
   * @component Video
   * Embeds YouTube/Vimeo via iframe or local video files.
   *
   * @prop {string} src - Video URL (YouTube, Vimeo, direct video file, or $assets/ path)
   * @prop {string} title - Accessible label for the video (required; rule 1.4)
   * @prop {Array<{ src: string, kind?: 'captions'|'subtitles', srclang?: string, label?: string }>} [tracks] -
   *   Caption/subtitle tracks for native (non-embed) video, rendered as <track>.
   *   Ignored for YouTube/Vimeo embeds — the platform owns their captions.
   * @prop {string} [transcript] - Transcript text shown in a <details> disclosure
   *   below the player. To load it from a file, import the file with Vite's ?raw
   *   suffix: `import t from '$assets/x.txt?raw'` then `transcript={t}`.
   */
  import { resolveAsset } from './util.js';
  import { resolveVideoEmbedUrl } from './video-embed.js';
  import MediaTracks from './MediaTracks.svelte';
  import Transcript from './Transcript.svelte';

  let { src, title, tracks = [], transcript = '' } = $props();
  let resolvedSrc = $derived(resolveAsset(src));
  let embedUrl = $derived(resolveVideoEmbedUrl(src));
</script>

<div class="tessera-video">
  {#if embedUrl !== null}
    <iframe
      class="tessera-video-embed"
      src={embedUrl}
      {title}
      loading="lazy"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    ></iframe>
  {:else}
    <video
      controls
      preload="none"
      class="tessera-video-native"
      aria-label={title}
    >
      <source src={resolvedSrc} />
      <MediaTracks {tracks} />
      Your browser does not support the video element.
    </video>
  {/if}
</div>

<Transcript text={transcript} />

<style>
  @layer tessera {
    .tessera-video {
      margin-bottom: var(--tessera-spacing-lg);
    }

    .tessera-video-embed {
      display: block;
      width: 100%;
      aspect-ratio: 16 / 9;
      border: none;
      border-radius: 8px;
    }

    .tessera-video-native {
      width: 100%;
      aspect-ratio: auto 16 / 9;
      border-radius: 8px;
      display: block;
    }
  }
</style>
