<script>
  import { untrack } from 'svelte';
  import { useQuestion } from 'tessera-learn';

  let { id, prompt, options, correct, weight } = $props();
  let selected = $state(null);

  const q = useQuestion({
    get id() {
      return id;
    },
    graded: true,
    weight: untrack(() => weight),
    response: () => ({
      type: 'choice',
      response: selected !== null ? [String(selected)] : [],
      correct: [String(correct)],
    }),
  });
</script>

<fieldset class="weighted-choice" data-question-id={id} disabled={q.locked}>
  <legend>{prompt}</legend>
  {#each options as opt, i (i)}
    <label>
      <input
        type="radio"
        name={id}
        checked={selected === i}
        onchange={() => {
          selected = i;
          q.submit();
        }}
      />
      {opt}
    </label>
  {/each}
</fieldset>
