<script>
  import { useQuestion } from '../../src/runtime/hooks.svelte.js';

  useQuestion({
    id: 'q2',
    graded: true,
    response: () => ({ id: 'q2', type: 'true-false', response: 'true' }),
  });
</script>

<h1>Graded page</h1>
