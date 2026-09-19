<script module>
  export const pageConfig = {
    title: 'Final Exam',
    graded: true,
    weight: 75,
  };
</script>

<script>
  import WeightedChoice from '../../components/WeightedChoice.svelte';
</script>

<h1>Final Exam</h1>
<p>Standalone questions, no quiz shell. Worth three quarters of the course.</p>

<WeightedChoice
  id="q-exam"
  prompt="What is the largest ocean?"
  options={['Atlantic', 'Indian', 'Pacific']}
  correct={2}
/>
