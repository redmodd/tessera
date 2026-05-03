<script context="module">
  export const pageConfig = { title: "Callouts & Images" };
</script>

<script>
  import { Callout, Image } from '@redmondelearning/tessera';
</script>

<h1>Callouts & Images</h1>

<Callout type="info">
  <p>This is an <strong>info</strong> callout.</p>
</Callout>

<Callout type="warning">
  <p>This is a <strong>warning</strong> callout.</p>
</Callout>

<Callout type="tip">
  <p>This is a <strong>tip</strong> callout.</p>
</Callout>

<Callout type="important">
  <p>This is an <strong>important</strong> callout.</p>
</Callout>

<Image src="$assets/test.png" alt="Test image" caption="A test image" />
