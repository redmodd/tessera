<script>
  import { useQuestion } from 'tessera-learn';

  let { id, prompt, options, correct } = $props();
  let selected = $state(null);

  const q = useQuestion({
    id,
    response: () => ({
      type: 'choice',
      response: selected !== null ? [String(selected)] : [],
      correct: [String(correct)],
    }),
    reset: () => {
      selected = null;
    },
  });

  function pick(i) {
    if (q.locked) return;
    selected = i;
    q.setAnswer(i);
  }
</script>

<fieldset class="inline-choice" data-question-id={id} disabled={q.locked}>
  <legend>{prompt}</legend>
  {#each options as opt, i (i)}
    <label>
      <input
        type="radio"
        name={id}
        checked={selected === i}
        onchange={() => pick(i)}
      />
      {opt}
    </label>
  {/each}
</fieldset>

<style>
  .inline-choice {
    border: 1px solid #ccc;
    margin: 0.75rem 0;
  }
  .inline-choice label {
    display: block;
  }
</style>
