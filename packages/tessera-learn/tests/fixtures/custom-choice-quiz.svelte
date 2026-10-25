<script>
  import Quiz from '../../src/components/Quiz.svelte';
  import CustomChoice from './custom-choice.svelte';
</script>

<Quiz>
  <CustomChoice id="q1" prompt="2 + 2?" options={['3', '4']} correct={1} />
  <CustomChoice id="q2" prompt="3 + 3?" options={['6', '7']} correct={0} />
</Quiz>
