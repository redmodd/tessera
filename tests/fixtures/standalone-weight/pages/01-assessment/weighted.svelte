<script module>
  export const pageConfig = { title: 'Weighted Questions', graded: true };
</script>

<script>
  import WeightedChoice from '../../components/WeightedChoice.svelte';
</script>

<h1>Weighted Questions</h1>
<p>
  Three graded questions, no quiz shell. The first counts for three; the survey
  has no correct answer, so it is left out of the score.
</p>

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

<WeightedChoice
  id="q-survey"
  prompt="How confident do you feel?"
  options={['Not yet', 'Somewhat', 'Very']}
/>
