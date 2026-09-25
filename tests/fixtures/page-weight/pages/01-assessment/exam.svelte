<script module>
  export const pageConfig = {
    title: 'Final Exam',
    graded: true,
    weight: 75,
  };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';
  import WeightedChoice from '../../components/WeightedChoice.svelte';

  let revealed = $state(false);
</script>

<h1>Final Exam</h1>
<p>Standalone questions, no quiz shell. Worth three quarters of the course.</p>

<WeightedChoice
  id="q-exam"
  prompt="What is the largest ocean?"
  options={['Atlantic', 'Indian', 'Pacific']}
  correct={2}
/>

{#if revealed}
  <MultipleChoice
    graded
    id="q-exam-reveal"
    question="Which planet is the largest?"
    options={['Mars', 'Jupiter', 'Venus']}
    correct={1}
  />
{:else}
  <button onclick={() => (revealed = true)}>Continue</button>
{/if}
