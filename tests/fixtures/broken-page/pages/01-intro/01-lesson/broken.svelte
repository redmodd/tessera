<script context="module">
  export const pageConfig = { title: 'Broken' };

  throw new Error('Tessera e2e: deliberate module-load failure');
</script>

<h2 data-testid="page-broken">Broken page</h2>
