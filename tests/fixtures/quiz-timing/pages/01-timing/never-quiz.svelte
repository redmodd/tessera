<script context="module">
  export const pageConfig = {
    title: 'Never Timing Quiz',
    quiz: {
      graded: true,
      gatesProgress: false,
      feedbackMode: 'never',
    },
  };
</script>

<script>
  import { MultipleChoice, FillInTheBlank } from 'tessera-learn';
</script>

<h1>Never Timing Quiz</h1>
<p>
  Graded, no feedback. There is no reveal step, so Submit is the only report.
</p>

<MultipleChoice
  question="How many continents are there?"
  options={['5', '6', '7', '8']}
  correct={2}
  correctFeedback="Correct!"
  incorrectFeedback="There are 7 continents."
/>

<FillInTheBlank
  question="What is the capital of Japan?"
  answers={['Tokyo', 'tokyo']}
  correctFeedback="Correct!"
  incorrectFeedback="The answer is Tokyo."
/>
