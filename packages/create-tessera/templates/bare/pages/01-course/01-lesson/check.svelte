<script module>
  export const pageConfig = { title: "Check" };
</script>

<script>
  import { useQuestion } from 'tessera-learn';

  let selected = $state(null);

  const q = useQuestion({
    id: 'check-1',
    response: () => ({
      type: 'choice',
      response: selected !== null ? [selected] : [],
      correct: ['a'],
    }),
    reset: () => { selected = null; },
  });
</script>

<h1>Quick check</h1>

<p>Tessera locks the data contract. Which option captures that?</p>

<fieldset disabled={q.submitted}>
  <label>
    <input type="radio" bind:group={selected} value="a" />
    Tessera locks the data contract.
  </label>
  <label>
    <input type="radio" bind:group={selected} value="b" />
    Tessera locks the presentation.
  </label>
</fieldset>

<button onclick={() => q.submit()} disabled={q.submitted || selected === null}>
  Submit
</button>

{#if q.submitted}
  <p>{q.correct ? 'Correct.' : 'Not quite — review the intro.'}</p>
{/if}
