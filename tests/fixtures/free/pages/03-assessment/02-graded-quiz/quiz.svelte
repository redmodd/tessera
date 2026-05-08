<script context="module">
  export const pageConfig = {
    title: "Graded Assessment",
    quiz: {
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
      showFeedback: true,
      feedbackMode: "immediate",
      retryMode: "incorrect-only",
    }
  }
</script>

<script>
  import { MultipleChoice, FillInTheBlank, Matching } from 'tessera-learn';
</script>

<h1>Graded Assessment</h1>
<p>This quiz is graded and gates progress. You must pass to continue.</p>

<MultipleChoice
  question="What is 2 + 2?"
  options={["3", "4", "5", "6"]}
  correct={1}
  correctFeedback="Correct! 2 + 2 = 4."
  incorrectFeedback="That's not right. 2 + 2 = 4."
  optionFeedback={["3 is too low.", "Correct!", "5 is too high.", "6 is way too high."]}
/>

<FillInTheBlank
  question="What color is the sky on a clear day?"
  answers={["blue", "Blue"]}
  correctFeedback="That's right! The sky is blue."
  incorrectFeedback="The correct answer is blue."
/>

<Matching
  question="Match the numbers with their words."
  pairs={[
    { left: "1", right: "One" },
    { left: "2", right: "Two" },
    { left: "3", right: "Three" },
  ]}
  correctFeedback="All matches correct!"
  incorrectFeedback="Some matches were incorrect."
/>
