<script module>
  export const pageConfig = {
    title: 'Id Collision Quiz',
    quiz: {
      graded: true,
      gatesProgress: false,
      feedbackMode: 'immediate',
    },
  };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';

  // Ids built at render time, so the build-time duplicate check cannot see them.
  const items = [
    {
      id: 'dupid',
      question: 'Which gas do plants absorb?',
      options: ['Oxygen', 'Carbon dioxide'],
      correct: 1,
    },
    {
      id: 'dupid',
      question: 'Which gas do plants release?',
      options: ['Oxygen', 'Nitrogen'],
      correct: 0,
    },
  ];
</script>

<h1>Id Collision Quiz</h1>
<p>Immediate feedback, and both questions carry the same id.</p>

{#each items as item, i (i)}
  <MultipleChoice
    id={item.id}
    question={item.question}
    options={item.options}
    correct={item.correct}
  />
{/each}
