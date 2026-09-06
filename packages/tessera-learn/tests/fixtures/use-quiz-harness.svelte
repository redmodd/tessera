<script>
  import { setContext, onDestroy, untrack } from 'svelte';
  import { useQuiz } from '../../src/runtime/hooks.svelte.js';

  // Test harness for use-quiz.test.ts. The test passes a pre-created `host`
  // element (already in document.body) so the hook's element() getter resolves
  // synchronously — bind:this assignments only flow through after the script
  // body has run, which is too late for tests that call submit() right away.
  // Props are read once at init by design — untrack() makes the snapshot intent
  // explicit so the compiler doesn't warn about non-reactive captures.
  let {
    ref,
    quizConfig,
    host,
    secondQuiz = false,
    nullElement = false,
    adapter = null,
    quizState = null,
  } = $props();

  const refSnap = untrack(() => ref);
  const hostSnap = untrack(() => host);
  const doubleRegister = untrack(() => secondQuiz);
  const forceNullElement = untrack(() => nullElement);
  const adapterSnap = untrack(() => adapter);

  setContext('tessera-page', {
    quiz: untrack(() => quizConfig),
    quizState: untrack(() => quizState),
    passingScore: 70,
  });
  if (adapterSnap) {
    setContext('tessera-adapter', {
      get adapter() {
        return adapterSnap;
      },
    });
  }

  function onComplete(e) {
    refSnap.events.push(e.detail);
  }

  hostSnap.addEventListener('tessera-quiz-complete', onComplete);

  try {
    const handle = useQuiz({
      element: () => (forceNullElement ? null : hostSnap),
    });
    refSnap.handle = handle;
    refSnap.element = hostSnap;
    if (doubleRegister) {
      // Second registration on the same page — should trigger the dev-mode
      // multi-quiz warning. Capture the second handle so the test can assert
      // it overwrites the first context.
      refSnap.secondHandle = useQuiz({ element: () => hostSnap });
    }
  } catch (err) {
    refSnap.thrown = err;
  }

  onDestroy(() => {
    hostSnap.removeEventListener('tessera-quiz-complete', onComplete);
  });
</script>
