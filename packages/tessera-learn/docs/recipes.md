# Layouts and recipes

Part of the Tessera authoring guide. [`AGENTS.md`](../AGENTS.md) holds the rules that apply to every task: read it first.

## Custom Layouts

`layout.svelte` at the course root replaces the default chrome. Scaffolded courses ship one: edit it, or delete it to get the default chrome back. The contract: it receives a single `page` snippet prop and renders it where the active page goes; use hooks for everything else.

```svelte
<!-- layout.svelte -->
<script>
  import { useNavigation, useProgress } from 'tessera-learn';

  let { page } = $props();
  const nav = useNavigation();
  const progress = useProgress();
</script>

<header>
  <h1>{nav.currentPage.title}</h1>
  <span>{progress.visitedPages.size} / {nav.pages.length} visited</span>
</header>

<main>{@render page()}</main>

<footer>
  <button disabled={!nav.canGoPrev} onclick={() => nav.prev()}>Prev</button>
  <button disabled={!nav.canGoNext} onclick={() => nav.next()}>Next</button>
</footer>
```

A custom layout gets no Exit button; add one with [`useCourse()`](hooks.md#usecourse).

`page()` renders inside a `div.tessera-page` (`display: contents`), so select page content with `.tessera-page h1`, not `main > h1`. On every page change after the first, focus moves to the page's first visible heading (`h1` preferred), or to a `tabindex="-1"` element wrapping it, never to a heading the layout renders. Focus stays put if it moved while the page loaded, including when the page focuses its own content.

To keep most of the default chrome, import `DefaultLayout` from `tessera-learn` and compose around it. With no `layout.svelte`, `chrome: 'custom'` in `course.config.js` renders pages with no chrome at all.

## Recipe 1: Custom "draw a line" question

A standalone practice widget written straight into a page. Emits a `matching` interaction (scored like `<Matching>`); `restore` shows the submitted pairs on a return visit. Submit stays disabled until every pair is drawn. To make a widget that also works inside a quiz, see [Recipe 2b](#recipe-2b-custom-question-widget-for-a-custom-quiz-shell).

```svelte
<!-- pages/05-pairs/01-pairs/draw-pairs.svelte -->
<script module>
  export const pageConfig = { title: 'Match the elements' };
</script>

<script>
  import { useQuestion } from 'tessera-learn';

  const CORRECT = [
    ['Hydrogen', 'H'],
    ['Helium', 'He'],
    ['Lithium', 'Li'],
  ];

  let pairs = $state([]);

  const q = useQuestion({
    id: 'drawPairs1',
    response: () => ({
      type: 'matching',
      response: pairs,
      correct: CORRECT,
      optionPairs: {
        left: CORRECT.map(([l]) => l),
        right: CORRECT.map(([, r]) => r),
      },
    }),
    reset: () => {
      pairs = [];
    },
    restore: (saved) => (pairs = saved),
  });

  function connect(l, r) {
    pairs = [...pairs.filter(([a]) => a !== l), [l, r]];
  }
</script>

<!-- line-drawing UI calls connect(l, r) on drop -->

<button
  onclick={q.submit}
  disabled={q.submitted || pairs.length < CORRECT.length}>Submit</button
>
{#if q.correct === true}<p>Correct.</p>{/if}
{#if q.canRetry}<button onclick={q.retry}>Try again</button>{/if}
```

## Recipe 2: Custom quiz shell via `quiz.svelte`

Drop `quiz.svelte` at the course root. It replaces the quiz UI on every quiz page.

```svelte
<!-- quiz.svelte -->
<script>
  import { useQuiz } from 'tessera-learn';

  let { children } = $props();

  const quiz = useQuiz();
  const answered = $derived(
    quiz.questions.filter((q) => q.answerComplete).length,
  );
</script>

<div class="my-quiz">
  {#each quiz.questions as q (q.id)}
    <section data-question-id={q.id}>
      {#if q.render}{@render q.render()}{/if}
    </section>
  {/each}

  {#if quiz.state === 'answering'}
    <p>{answered} of {quiz.questions.length} answered</p>
    <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}
      >Submit</button
    >
  {:else if quiz.state === 'submitted'}
    <p>You scored {quiz.score}% (pass at {quiz.passingScore}%)</p>
    {#if quiz.bestScore > quiz.score}<p>Best attempt: {quiz.bestScore}%</p>{/if}
    {#if quiz.canRetry}<button onclick={() => quiz.retry()}>Retry</button>{/if}
    {#if !quiz.restored}<button onclick={() => quiz.startReview()}
        >Review</button
      >{/if}
  {:else}
    <button onclick={() => quiz.exitReview()}>Back to results</button>
  {/if}

  <!-- Required: questions register only when children render. Hidden keeps widget state across submit/review. -->
  <div style="display:none">{@render children?.()}</div>
</div>
```

`children` is the whole page body as one snippet, and built-in widgets render nothing inside it. Two layouts:

| Layout          | `children`       | `q.render()`          | Page prose         |
| --------------- | ---------------- | --------------------- | ------------------ |
| Snippet (above) | rendered hidden  | rendered per question | unavailable        |
| Inline          | rendered visibly | never called          | interleaved freely |

Inline layout needs custom widgets that render their own markup instead of calling `setRender`. Built-in widgets render nothing in that layout.

## Recipe 2b: Custom question widget for a custom quiz shell

The widget calls `useQuestion()`, registers a render snippet with `setRender`, pushes answers up with `setAnswer`, and reads `locked`/`feedbackVisible`/`answer`. It never reports: the shell does.

```svelte
<!-- components/MyChoice.svelte -->
<script>
  import { onMount } from 'svelte';
  import { useQuestion } from 'tessera-learn';

  let { id, prompt, options, correct } = $props();
  let selected = $state(null);

  const q = useQuestion({
    id,
    response: () => ({
      type: 'choice',
      response: selected !== null ? [String(selected)] : [],
      correct: [String(correct)],
      options: options.map((_, i) => String(i)),
    }),
    reset: () => {
      selected = null;
    },
    restore: ([choice]) => (selected = Number(choice)), // shows the saved answer on a return visit
  });

  onMount(() => q.setRender(view)); // no-op in standalone mode

  function pick(i) {
    if (q.locked) return;
    selected = i;
    q.setAnswer(i);
  }
</script>

{#snippet view()}
  <fieldset disabled={q.locked}>
    <legend>{prompt}</legend>
    {#each options as opt, i}
      {@const chosen = (q.feedbackVisible ? q.answer : selected) === i}
      <label>
        <input
          type="radio"
          name={id}
          checked={chosen}
          onchange={() => pick(i)}
        />
        {opt}
      </label>
    {/each}
  </fieldset>

  {#if q.feedbackVisible}
    <p>
      {q.answer === correct
        ? 'Correct.'
        : 'The right answer was ' + options[correct] + '.'}
    </p>
  {/if}
{/snippet}

{#if q.mode === 'standalone'}
  {@render view()}
  {#if !q.submitted}
    <button disabled={selected === null} onclick={q.submit}>Submit</button>
  {:else if q.canRetry}
    <button onclick={q.retry}>Try again</button>
  {/if}
{/if}
```

Feedback timing: `feedbackMode: 'immediate'` → shell calls `quiz.revealFeedback(q)`, flipping `feedbackVisible` (and `locked`). `'review'` → after `submit()` + `startReview()`. `'never'` → `feedbackVisible` stays false but `locked` still flips on submit.

## Recipe 2c: Inline layout (prose between questions)

Render `children` visibly, never call `q.render()`, and let widgets render their own markup. Questions then sit in page order, interleaved with the page's prose.

```svelte
<!-- quiz.svelte -->
<div>
  {@render children?.()}
  <button disabled={!quiz.canSubmit} onclick={() => quiz.submit()}
    >Submit</button
  >
</div>
```

```svelte
<!-- components/InlineChoice.svelte: no setRender, no mode branch -->
<fieldset disabled={q.locked}>
  <legend>{prompt}</legend>
  {#each options as opt, i (i)}
    <label
      ><input
        type="radio"
        name={id}
        checked={selected === i}
        onchange={() => pick(i)}
      />
      {opt}</label
    >
  {/each}
</fieldset>
```

Built-in widgets render nothing in this layout (`QuestionShell` renders inline only when standalone). Mixing is fine in one shell: render `children` visibly **and** `{#if q.render}` the snippet list, and each widget lands in whichever branch it registered for.

## Recipe 3: Graded standalone question

A standalone question (no `<Quiz>`) counts toward course success when built with `graded: true` + a `score()` returning 0–100 on a page that declares `pageConfig.graded: true`; omit `correct` to accept any answer. Course success rolls up across every declared graded page, quiz and standalone pages alike.

```js
const q = useQuestion({
  id: 'whyItMatters',
  graded: true,
  response: () => ({ type: 'long-fill-in', response: answer }),
  score: () => (answer.trim().length >= 50 ? 100 : 0),
  reset: () => {
    answer = '';
  },
  restore: (saved) => (answer = saved), // shows the saved answer on a return visit
});
```

Render a Try again button while `q.canRetry`: a submitted answer stays submitted and locked when the learner returns to the page.

## Recipe 4: Chunked-reveal page with `markChunk`

Reveals sections one at a time. `markChunk(pageIndex, chunkIndex)` records the highest revealed chunk so the page resumes mid-scroll on reload.

```svelte
<!-- pages/02-deep-dive/01-concepts/long-read.svelte -->
<script module>
  export const pageConfig = { title: 'How it works' };
</script>

<script>
  import { useNavigation, useProgress } from 'tessera-learn';

  const nav = useNavigation();
  const progress = useProgress();
  const pageIndex = $derived(nav.currentPageIndex);

  const TOTAL_CHUNKS = 4;
  let revealed = $state(progress.chunkProgress.get(pageIndex) ?? 0);

  function reveal() {
    revealed = Math.min(revealed + 1, TOTAL_CHUNKS - 1);
    progress.markChunk(pageIndex, revealed);
  }
</script>

{#each Array(revealed + 1) as _, i}
  <section>
    <h2>Step {i + 1}</h2>
    <p>Content for step {i + 1}.</p>
  </section>
{/each}

{#if revealed < TOTAL_CHUNKS - 1}
  <button onclick={reveal}>Show next</button>
{/if}
```
