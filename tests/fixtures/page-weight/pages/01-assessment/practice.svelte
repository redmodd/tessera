<script module>
  export const pageConfig = {
    title: 'Practice',
    weight: 100,
    quiz: { graded: true, required: false },
  };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';
</script>

<h1>Practice</h1>
<p>Optional: counts when taken, absent from the rollup when skipped.</p>

<MultipleChoice
  id="q-practice"
  question="Which gas do plants absorb?"
  options={['Oxygen', 'Carbon dioxide', 'Nitrogen']}
  correct={1}
/>
