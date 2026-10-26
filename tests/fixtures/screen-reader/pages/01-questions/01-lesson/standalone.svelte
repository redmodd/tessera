<script module>
  export const pageConfig = { title: 'Standalone Questions' };
</script>

<script>
  import {
    MultipleChoice,
    FillInTheBlank,
    Matching,
    Sorting,
  } from 'tessera-learn';
</script>

<h1>Standalone Questions</h1>

<MultipleChoice
  question="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth']}
  correct={1}
  incorrectFeedback="Mercury is the closest planet."
/>

<FillInTheBlank
  question="What is the chemical symbol for water?"
  answers="H2O"
  incorrectFeedback="The answer is H2O."
/>

<Matching
  question="Match the numbers with their words."
  pairs={[
    { left: '1', right: 'One' },
    { left: '2', right: 'Two' },
  ]}
/>

<Sorting
  question="Sort each item"
  items={['Apple', 'Carrot']}
  targets={['Fruit', 'Vegetable']}
  correct={[0, 1]}
/>
