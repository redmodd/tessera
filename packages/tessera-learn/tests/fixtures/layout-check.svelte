<script>
  import { useQuestion } from '../../src/runtime/hooks.svelte.js';

  let { id } = $props();

  useQuestion({
    get id() {
      return id;
    },
    graded: true,
    response: () => ({ type: 'true-false', response: true, correct: true }),
  }).submit();
</script>
