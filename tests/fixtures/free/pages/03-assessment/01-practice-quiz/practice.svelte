<script context="module">
  export const pageConfig = {
    title: "Practice Quiz",
    quiz: {
      graded: false,
      gatesProgress: false,
      maxAttempts: Infinity,
      showFeedback: true,
    }
  }
</script>

<script>
  import { MultipleChoice, FillInTheBlank } from '@redmondelearning/tessera';
</script>

<h1>Practice Quiz</h1>
<p>This is a practice quiz — it won't count toward your grade.</p>

<MultipleChoice
  question="Which planet is closest to the Sun?"
  options={["Venus", "Mercury", "Earth", "Mars"]}
  correct={1}
  correctFeedback="Correct! Mercury is closest to the Sun."
  incorrectFeedback="Not quite — Mercury is the closest planet to the Sun."
/>

<FillInTheBlank
  question="What is the chemical symbol for water?"
  answers={["H2O", "h2o"]}
  correctFeedback="Correct! Water is H2O."
  incorrectFeedback="The correct answer is H2O."
/>
