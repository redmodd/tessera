<script>
  /**
   * @component MediaTracks
   * Renders caption/subtitle <track> elements for a native <audio>/<video>.
   * Used inline as a child of the media element so the tracks attach to it.
   *
   * @prop {Array<{ src: string, kind?: 'captions'|'subtitles', srclang?: string, label?: string }>} [tracks]
   */
  import { resolveAsset } from './util.js';

  let { tracks = [] } = $props();
</script>

{#each tracks as track, i (i)}
  <track
    src={resolveAsset(track.src)}
    kind={track.kind ?? 'captions'}
    srclang={track.srclang}
    label={track.label}
  />
{/each}
