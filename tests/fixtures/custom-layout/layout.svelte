<script>
  import { useNavigation, useProgress } from 'tessera-learn';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
</script>

<header data-testid="custom-header">
  <h1>Custom Course Shell</h1>
  <span data-testid="custom-progress">{progress.visitedPages.size}/{nav.pages.length}</span>
</header>

<main data-testid="custom-main">
  {@render page()}
</main>

<footer>
  <button data-testid="custom-prev" disabled={!nav.canGoPrev} onclick={() => nav.prev()}>Prev</button>
  <button data-testid="custom-next" disabled={!nav.canGoNext} onclick={() => nav.next()}>Next</button>
</footer>
