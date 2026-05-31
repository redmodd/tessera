<script module>
  export const pageConfig = { title: 'Welcome' };
</script>

<script>
  import Button from '$shared/Button.svelte';
</script>

<h1>Welcome to __PROJECT_TITLE__</h1>

<p>This is a basic demo page of your Tessera course.</p>

<p>
  Point your agent to <code>AGENTS.md</code> at the workspace root for the
  authoring guide. The button below is imported from the workspace design system
  via <code>$shared</code>.
</p>

<Button>A shared button</Button>
