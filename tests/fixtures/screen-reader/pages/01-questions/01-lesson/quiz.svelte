<script module>
  export const pageConfig = {
    title: 'Immediate Quiz',
    quiz: { feedbackMode: 'immediate' },
  };
</script>

<script>
  import { MultipleChoice, FillInTheBlank } from 'tessera-learn';
</script>

<h1>Immediate Quiz</h1>

<MultipleChoice
  question="What is 2 + 2?"
  options={['3', '4', '5']}
  correct={1}
/>

<FillInTheBlank question="What color is a clear sky?" answers="blue" />
