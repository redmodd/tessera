<script>
  import Quiz from '../../src/components/Quiz.svelte';
  import CustomChoice from './custom-choice.svelte';

  let { draws } = $props();
  let round = $state(0);
</script>

<Quiz>
  <button class="redraw" onclick={() => round++}>Redraw</button>
  {#key round}
    {#each draws[round] as id (id)}
      <CustomChoice {id} prompt={id} options={['yes', 'no']} correct={0} />
    {/each}
  {/key}
</Quiz>
