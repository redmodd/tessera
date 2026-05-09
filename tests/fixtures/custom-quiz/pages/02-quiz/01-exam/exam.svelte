<script context="module">
  export const pageConfig = {
    title: "Exam",
    quiz: {
      graded: true,
      gatesProgress: false,
      maxAttempts: 3,
      showFeedback: true,
    },
  };
</script>

<script>
  import { MultipleChoice, FillInTheBlank } from 'tessera-learn';
</script>

<MultipleChoice
  id="q-planet"
  question="Which planet is closest to the Sun?"
  options={["Venus", "Mercury", "Earth", "Mars"]}
  correct={1}
/>

<FillInTheBlank
  id="q-water"
  question="What is the chemical symbol for water?"
  answers={["H2O", "h2o"]}
/>
