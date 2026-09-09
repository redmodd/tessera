<script module>
  export const pageConfig = { title: 'Weighted Questions' };
</script>

<script>
  import WeightedChoice from '../../components/WeightedChoice.svelte';
</script>

<h1>Weighted Questions</h1>
<p>Two graded questions, no quiz shell. The first counts for three.</p>

<WeightedChoice
  id="q-heavy"
  prompt="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth']}
  correct={1}
  weight={3}
/>

<WeightedChoice
  id="q-light"
  prompt="What is the largest ocean?"
  options={['Atlantic', 'Indian', 'Pacific']}
  correct={2}
  weight={1}
/>
