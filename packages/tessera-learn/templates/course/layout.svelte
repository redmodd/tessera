<script>
  import '$shared/tokens.css';
  import { useNavigation, useProgress } from 'tessera-learn';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
</script>

<div class="course">
  <header>
    <h1>__PROJECT_TITLE__</h1>
    <span class="progress"
      >{progress.visitedPages.size} / {nav.pages.length}</span
    >
  </header>

  <main>
    {@render page()}
  </main>

  <footer>
    <button
      class="nav-btn"
      disabled={!nav.canGoPrev}
      onclick={() => nav.prev()}
    >
      ← Previous
    </button>
    <button
      class="nav-btn nav-btn--primary"
      disabled={!nav.canGoNext}
      onclick={() => nav.next()}
    >
      Next →
    </button>
  </footer>
</div>

<style>
  .course {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tessera-spacing-md);
    padding: var(--tessera-spacing-md) var(--tessera-spacing-xl);
    border-bottom: 1px solid var(--tessera-border);
  }

  header h1 {
    margin: 0;
    font-size: 1.125rem;
  }

  .progress {
    flex: none;
    padding: 0.15rem 0.6rem;
    border-radius: 999px;
    background: var(--tessera-bg-secondary);
    color: var(--tessera-text-light);
    font-size: 0.875rem;
  }

  main {
    flex: 1;
    width: 100%;
    max-width: var(--tessera-content-max-width);
    margin: 0 auto;
    padding: var(--tessera-spacing-xl);
  }

  footer {
    display: flex;
    justify-content: space-between;
    gap: var(--tessera-spacing-md);
    padding: var(--tessera-spacing-md) var(--tessera-spacing-xl);
    border-top: 1px solid var(--tessera-border);
  }

  .nav-btn {
    padding: 0.5rem 1rem;
    border: 1px solid var(--tessera-border);
    border-radius: 6px;
    background: var(--tessera-bg);
    color: var(--tessera-text);
    cursor: pointer;
    transition:
      background var(--tessera-transition-fast),
      border-color var(--tessera-transition-fast);
  }

  .nav-btn:hover:not(:disabled) {
    background: var(--tessera-bg-secondary);
  }

  .nav-btn--primary {
    border-color: transparent;
    background: var(--tessera-primary);
    color: #fff;
  }

  .nav-btn--primary:hover:not(:disabled) {
    background: var(--tessera-primary-dark);
  }

  .nav-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
