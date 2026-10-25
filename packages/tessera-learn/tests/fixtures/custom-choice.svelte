<script>
  import { onMount } from 'svelte';
  import { QuestionReview, useQuestion } from '../../src/index.js';

  let { id, prompt, options, correct } = $props();
  let selected = $state(null);

  const q = useQuestion({
    get id() {
      return id;
    },
    response: () => ({
      type: 'choice',
      response: selected !== null ? [String(selected)] : [],
      correct: [String(correct)],
      options: options.map((_, i) => String(i)),
    }),
    reset: () => {
      selected = null;
    },
    restore: ([choice]) => (selected = Number(choice)),
  });

  onMount(() => q.setRender(view));

  function pick(i) {
    selected = i;
    q.setAnswer(i);
  }
</script>

{#snippet view()}
  <div>
    <fieldset disabled={q.locked}>
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
    <QuestionReview {q}>
      {#if !q.correct}<p>The right answer was {options[correct]}.</p>{/if}
    </QuestionReview>
  </div>
{/snippet}

{#if q.mode === 'standalone'}{@render view()}{/if}
