<script module>
  export const pageConfig = { title: 'Practice Retry' };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';
</script>

<h1>Practice Retry</h1>
<p>An ungraded built-in question with one retry.</p>

<MultipleChoice
  id="q-retry"
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth']}
  correct={1}
  maxRetries={1}
/>
