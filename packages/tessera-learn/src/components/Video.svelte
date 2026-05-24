<script>
  /**
   * @component Video
   * Embeds YouTube/Vimeo via iframe or local video files.
   * Lazy-loads via IntersectionObserver.
   *
   * @prop {string} src - Video URL (YouTube, Vimeo, direct video file, or $assets/ path)
   * @prop {string} [title] - Accessible label for the video
   */
  import { onMount } from 'svelte';
  import { resolveAsset } from './util.js';

  let { src, title = '' } = $props();
  let resolvedSrc = $derived(resolveAsset(src));
  let containerRef = $state(null);
  let visible = $state(false);

  const youtubeRegex =
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/;

  let embedUrl = $derived.by(() => {
    const ytMatch = src.match(youtubeRegex);
    if (ytMatch) return `https://www.youtube.com/embed/${ytMatch[1]}`;

    const vimeoMatch = src.match(vimeoRegex);
    if (vimeoMatch) return `https://player.vimeo.com/video/${vimeoMatch[1]}`;

    return null;
  });

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
        Your browser does not support the video element.
      </video>
    {/if}
  {:else}
    <div class="tessera-video-placeholder">
      <span class="tessera-video-placeholder-icon" aria-hidden="true">▶</span>
    </div>
  {/if}
</div>

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
</style>
