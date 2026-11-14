<script>
  import Quiz from '../../src/components/Quiz.svelte';

  let { widget: Widget, ...props } = $props();
</script>

<Quiz>
  <Widget {...props} />
</Quiz>
