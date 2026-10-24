<script module>
  export const pageConfig = { title: 'Summary' };
</script>

<h2 data-testid="page-summary">Summary page</h2>

<input
  data-testid="summary-notes"
  aria-label="Notes"
  {@attach (el) => el.focus()}
/>
