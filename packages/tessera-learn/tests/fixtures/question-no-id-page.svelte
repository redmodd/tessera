<script>
  import MultipleChoice from '../../src/components/MultipleChoice.svelte';
  const q = { question: 'Pick a', options: ['a', 'b'], correct: 0 };
</script>

<h1>Question page</h1>
<MultipleChoice {...q} />
