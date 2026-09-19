<script module>
  export const pageConfig = {
    title: 'Knowledge Check',
    weight: 25,
    quiz: { graded: true },
  };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';
</script>

<h1>Knowledge Check</h1>
<p>A quiz page worth a quarter of the course.</p>

<MultipleChoice
  id="q-check"
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth']}
  correct={1}
/>
