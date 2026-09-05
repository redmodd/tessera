<script context="module">
  export const pageConfig = {
    title: 'Review Timing Quiz',
    quiz: {
      graded: true,
      gatesProgress: false,
      feedbackMode: 'review',
    },
  };
</script>

<script>
  import { MultipleChoice, FillInTheBlank, Matching } from 'tessera-learn';
</script>

<h1>Review Timing Quiz</h1>
<p>Graded, review feedback. Nothing reaches the LMS until Submit.</p>

<MultipleChoice
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Mars', 'Earth']}
  correct={1}
  correctFeedback="Correct! Mercury is closest."
  incorrectFeedback="Mercury is closest to the Sun."
/>

<FillInTheBlank
  question="What is the chemical formula for water?"
  answers={['H2O', 'h2o']}
  correctFeedback="Correct!"
  incorrectFeedback="The answer is H2O."
/>

<Matching
  question="Match the numbers with their words."
  pairs={[
    { left: '1', right: 'One' },
    { left: '2', right: 'Two' },
    { left: '3', right: 'Three' },
  ]}
  correctFeedback="All matches correct!"
  incorrectFeedback="Some matches were incorrect."
/>
