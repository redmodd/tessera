<script>
  import { onMount, untrack } from 'svelte';
  import { useQuiz } from '../../src/runtime/hooks.svelte.js';
  import CustomChoice from './custom-choice.svelte';

  let { ref, ids, hideOnResults = false, remountOnMount = false } = $props();
  const quiz = useQuiz();
  const shown = $state(untrack(() => ids.map((id, key) => ({ id, key }))));
  untrack(() => ref).quiz = quiz;
  untrack(() => ref).drop = (i) => shown.splice(i, 1);
  let mounts = $state(0);
  onMount(() => {
    if (remountOnMount) mounts++;
  });
</script>

{#each quiz.questions as q (q)}
  <section data-question-id={q.id}>
    {#if q.render}{@render q.render()}{/if}
  </section>
{/each}

{#if !hideOnResults || quiz.state !== 'submitted'}
  {#key mounts}
    {#each shown as item (item.key)}
      <CustomChoice
        id={item.id}
        prompt={item.id}
        options={['yes', 'no']}
        correct={0}
      />
    {/each}
  {/key}
{/if}
