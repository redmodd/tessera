<script>
  /**
   * @component Video
   * Embeds YouTube/Vimeo via iframe or local video files.
   * Lazy-loads via IntersectionObserver.
   *
   * @prop {string} src - Video URL (YouTube, Vimeo, direct video file, or $assets/ path)
   * @prop {string} title - Accessible label for the video (required; rule 1.4)
   * @prop {Array<{ src: string, kind?: 'captions'|'subtitles', srclang?: string, label?: string }>} [tracks] -
   *   Caption/subtitle tracks for native (non-embed) video, rendered as <track>.
   *   Ignored for YouTube/Vimeo embeds — the platform owns their captions.
   * @prop {string} [transcript] - Transcript text (or $assets/ path) shown in a
   *   <details> disclosure below the player.
   */
  import { onMount } from 'svelte';
  import { resolveAsset } from './util.js';
  import { resolveVideoEmbedUrl } from './video-embed.js';

  let { src, title, tracks = [], transcript = '' } = $props();
  let resolvedSrc = $derived(resolveAsset(src));
  let containerRef = $state(null);
  let visible = $state(false);

  let embedUrl = $derived(resolveVideoEmbedUrl(src));
  let isEmbed = $derived(embedUrl !== null);

  onMount(() => {
    if (!containerRef) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          visible = true;
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );

    observer.observe(containerRef);
    return () => observer.disconnect();
  });
</script>

<div
  class="tessera-video"
  bind:this={containerRef}
  aria-label={title || 'Video'}
>
  {#if visible}
    {#if isEmbed}
      <div class="tessera-video-embed">
        <iframe
          src={embedUrl}
          {title}
          frameborder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowfullscreen
        ></iframe>
      </div>
    {:else}
      <video controls class="tessera-video-native" aria-label={title}>
        <source src={resolvedSrc} />
        {#each tracks as track (track.src)}
          <track
            src={resolveAsset(track.src)}
            kind={track.kind ?? 'captions'}
            srclang={track.srclang}
            label={track.label}
          />
        {/each}
        Your browser does not support the video element.
      </video>
    {/if}
  {:else}
    <div class="tessera-video-placeholder">
      <span class="tessera-video-placeholder-icon" aria-hidden="true">▶</span>
    </div>
  {/if}
</div>

{#if transcript}
  <details class="tessera-video-transcript">
    <summary>Transcript</summary>
    <div class="tessera-video-transcript-body">{transcript}</div>
  </details>
{/if}

<style>
  .tessera-video {
    margin-bottom: var(--tessera-spacing-lg);
  }

  .tessera-video-embed {
    position: relative;
    padding-bottom: 56.25%; /* 16:9 */
    height: 0;
    overflow: hidden;
    border-radius: 8px;
  }

  .tessera-video-embed iframe {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: none;
    border-radius: 8px;
  }

  .tessera-video-native {
    width: 100%;
    border-radius: 8px;
    display: block;
  }

  .tessera-video-placeholder {
    aspect-ratio: 16 / 9;
    background-color: var(--tessera-bg-secondary);
    border: 1px solid var(--tessera-border);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tessera-video-placeholder-icon {
    font-size: 2rem;
    color: var(--tessera-text-light);
  }

  .tessera-video-transcript {
    margin-top: var(--tessera-spacing-sm);
    margin-bottom: var(--tessera-spacing-lg);
    font-size: 0.875rem;
  }

  .tessera-video-transcript summary {
    cursor: pointer;
    font-weight: 600;
    color: var(--tessera-text);
  }

  .tessera-video-transcript-body {
    margin-top: var(--tessera-spacing-sm);
    color: var(--tessera-text-light);
    white-space: pre-line;
  }
</style>
