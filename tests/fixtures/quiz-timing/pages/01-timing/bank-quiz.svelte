<script module>
  export const pageConfig = {
    title: 'Bank Quiz',
    quiz: { draw: { bank: 2 }, shuffle: true },
  };
</script>

<script>
  import { MultipleChoice } from 'tessera-learn';
</script>

<h1>Bank Quiz</h1>
<p>Every attempt asks the intro question and two drawn from the bank.</p>

<MultipleChoice
  id="bank_intro"
  question="Intro question"
  options={['Right', 'Wrong']}
  correct={0}
/>
<MultipleChoice
  id="bank_1"
  pool="bank"
  question="Bank question 1"
  options={['Right', 'Wrong']}
  correct={0}
/>
<MultipleChoice
  id="bank_2"
  pool="bank"
  question="Bank question 2"
  options={['Right', 'Wrong']}
  correct={0}
/>
<MultipleChoice
  id="bank_3"
  pool="bank"
  question="Bank question 3"
  options={['Right', 'Wrong']}
  correct={0}
/>
<MultipleChoice
  id="bank_4"
  pool="bank"
  question="Bank question 4"
  options={['Right', 'Wrong']}
  correct={0}
/>
