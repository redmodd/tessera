<script>
  import { QuestionReview, useQuestion } from '../../src/index.js';

  let { id } = $props();
  let selected = $state(null);

  const q = useQuestion({
    get id() {
      return id;
    },
    response: () => ({
      type: 'choice',
      response: selected !== null ? [String(selected)] : [],
      correct: ['1'],
      options: ['0', '1'],
    }),
    reset: () => {
      selected = null;
    },
  });
</script>

<input
  type="radio"
  name={id}
  checked={selected === 0}
  onchange={() => {
    selected = 0;
    q.setAnswer(0);
  }}
/>
<QuestionReview {q} />
