<script context="module">
  export const pageConfig = { title: 'Modal, Video & Audio' };
</script>

<script>
  import { RevealModal, Audio } from 'tessera-learn';
</script>

<h1>Modal, Video & Audio</h1>

<h2>RevealModal</h2>

<RevealModal title="More Details">
  {#snippet trigger()}
    <button
      style="padding: 0.5rem 1rem; background: var(--tessera-primary); color: white; border: none; border-radius: 6px; cursor: pointer;"
      >Click to reveal</button
    >
  {/snippet}
  {#snippet content()}
    <p>This content appears in a modal overlay.</p>
    <p>Focus should be trapped inside this modal.</p>
  {/snippet}
</RevealModal>

<h2>Audio</h2>

<Audio
  src="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
  title="Sample Audio"
  transcript="An instrumental sample track used to demonstrate the audio player."
/>
