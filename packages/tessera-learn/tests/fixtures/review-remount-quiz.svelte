<script>
  import { untrack } from 'svelte';
  import { useQuiz } from '../../src/runtime/hooks.svelte.js';
  import CustomChoice from './custom-choice.svelte';

  let { ref } = $props();
  const quiz = useQuiz();
  untrack(() => ref).quiz = quiz;
</script>

{#each quiz.questions as q (q)}
  {#if q.render}{@render q.render()}{/if}
{/each}

{#if quiz.state !== 'submitted'}
  {#each ['a', 'b'] as id (id)}
    <CustomChoice {id} prompt={id} options={['yes', 'no']} correct={0} />
  {/each}
{/if}
