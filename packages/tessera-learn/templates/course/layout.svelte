<script>
  import '$shared/tokens.css';
  import { useNavigation, useProgress } from 'tessera-learn';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
</script>

<header>
  <h1>__PROJECT_TITLE__</h1>
  <span>{progress.visitedPages.size} / {nav.pages.length}</span>
</header>

<main>
  {@render page()}
</main>

<footer>
  <button disabled={!nav.canGoPrev} onclick={() => nav.prev()}>Previous</button>
  <button disabled={!nav.canGoNext} onclick={() => nav.next()}>Next</button>
</footer>
