<script context="module">
  export const pageConfig = {
    title: 'Inline Exam',
    quiz: {
      graded: false,
      maxAttempts: 3,
    },
  };
</script>

<script>
  import InlineChoice from '../../../components/InlineChoice.svelte';
</script>

<h1 data-testid="inline-heading">Inline Exam</h1>

<p data-testid="inline-prose-1">Read this before the first question.</p>

<InlineChoice
  id="q-inline-planet"
  prompt="Which planet is closest to the Sun?"
  options={['Venus', 'Mercury', 'Earth', 'Mars']}
  correct={1}
/>

<p data-testid="inline-prose-2">And this sits between the two questions.</p>

<InlineChoice
  id="q-inline-ocean"
  prompt="Which is the largest ocean?"
  options={['Atlantic', 'Indian', 'Pacific', 'Arctic']}
  correct={2}
/>

<p data-testid="inline-prose-3">Closing note after the last question.</p>
