<script>
  import { useQuestion } from '../../src/runtime/hooks.svelte.js';

  useQuestion({
    id: 'q1',
    graded: false,
    response: () => ({ id: 'q1', type: 'true-false', response: 'true' }),
  });
</script>

<h1>Practice page</h1>
