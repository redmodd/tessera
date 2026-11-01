<script module>
  export const pageConfig = {
    title: 'Exam',
    quiz: {
      graded: true,
      gatesProgress: false,
      maxAttempts: 3,
    },
  };
</script>

<script>
  import { MultipleChoice, FillInTheBlank } from 'tessera-learn';
  import InlineChoice from '../../../components/InlineChoice.svelte';
</script>

<MultipleChoice
  id="q-planet"
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth', 'Mars']}
  correct={1}
/>

<FillInTheBlank
  id="q-water"
  question="What is the chemical symbol for water?"
  answers={['H2O', 'h2o']}
/>

<!-- No `correct`: left out of the score and reported with no result. -->
<InlineChoice
  id="q-survey"
  prompt="How confident do you feel about the solar system?"
  options={['Not yet', 'Somewhat', 'Very']}
/>
