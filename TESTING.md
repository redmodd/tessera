# Testing

This guide covers how Tessera's test suite is organised and how to run it locally. For general contributor setup, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Prerequisites

- Node.js >= 24 (CI runs against Node 24)
- pnpm (the repo is a pnpm workspace; corepack picks the right version)

A first-time setup script is available:

```bash
./scripts/setup-e2e.sh
```

It runs `pnpm install`, builds the workspace, and installs the Playwright Chromium build with system deps. Idempotent — safe to re-run.

## Layout

```
packages/
  tessera-learn/tests/   # unit tests for the runtime + plugin (Vitest)
  create-tessera/tests/  # unit tests for the CLI scaffolder (Vitest)
tests/
  e2e/                   # Playwright specs across all export modes
  fixtures/              # course projects used by the e2e suite (committed)
  .e2e-variants/         # generated per run by globalSetup; gitignored
```

## Running tests

### Unit tests (Vitest)

```bash
pnpm test                # runs unit tests in both packages
pnpm test:coverage       # same, with v8 coverage reports under packages/*/coverage/
```

Per-package or single-file runs:

```bash
pnpm --filter tessera-learn test
pnpm --filter create-tessera test

# inside a package directory, run a single test file
cd packages/tessera-learn
pnpm exec vitest run tests/scorm12.test.ts

# watch mode while iterating
pnpm exec vitest tests/scorm12.test.ts
```

### End-to-end tests (Playwright)

```bash
pnpm build           # tessera-learn must be built first — fixtures import its plugin
pnpm test:e2e        # runs all Playwright projects
```

Filter to a specific project or grep:

```bash
pnpm exec playwright test --project=lms
pnpm exec playwright test tests/e2e/quiz.spec.ts
pnpm exec playwright test --grep "saves progress"
```

Headed / debug:

```bash
pnpm exec playwright test --headed --project=free-mode
pnpm exec playwright test --debug tests/e2e/navigation.spec.ts
```

When a run fails, the HTML report lands at `playwright-report/`. Open it with:

```bash
pnpm exec playwright show-report
```

## How the e2e suite is wired

Playwright is configured in [`playwright.config.ts`](./playwright.config.ts). Seven projects each target a different fixture / mode on its own port:

| Project           | Port | Fixture                         | Specs                        |
| ----------------- | ---- | ------------------------------- | ---------------------------- |
| `free-mode`       | 5180 | `tests/fixtures/free`           | most non-mode-specific specs |
| `sequential-mode` | 5181 | `tests/fixtures/sequential`     | `sequential.spec.ts`         |
| `custom-layout`   | 5182 | `tests/fixtures/custom-layout`  | `layout-override.spec.ts`    |
| `custom-quiz`     | 5183 | `tests/fixtures/custom-quiz`    | `custom-quiz.spec.ts`        |
| `mobile`          | 5180 | `tests/fixtures/free` (375x667) | `mobile.spec.ts`             |
| `export`          | n/a  | pre-built variants              | `export.spec.ts`             |
| `lms`             | n/a  | pre-built variants              | `lms-roundtrip.spec.ts`      |

### The variant pre-build

The `export` and `lms` projects don't run a dev server — they read pre-built `dist/` output for each export standard (`web`, `scorm12`, `scorm2004`, `cmi5`, `xapi`).

Building those mid-test would mutate the source fixtures and serialise the suite. Instead, [`tests/e2e/global-setup.ts`](./tests/e2e/global-setup.ts) runs once before any spec:

1. Wipes `tests/.e2e-variants/`.
2. For each fixture in the `FIXTURES` map and the standards it declares (`web`/`scorm12`/`scorm2004`/`cmi5`/`xapi`):
   - Copies the fixture into `tests/.e2e-variants/{fixture}/{standard}/`
   - Symlinks the fixture's `node_modules` into the variant (workspace deps aren't hoisted to the repo root).
   - Runs `vite build` in parallel with `TESSERA_STANDARD` set to that variant.

A variant-built fixture's `vite.config.js` must forward that env var to the plugin:

```js
tesseraPlugin({ standardOverride: process.env.TESSERA_STANDARD });
```

Without it the variant builds whatever `course.config.js` declares, so globalSetup fails the build rather than let the wrong standard through.

A fixture entry can also carry `overrides` for a variant that differs by a course-level setting, since one `course.config.js` holds one value per axis. globalSetup re-emits the copied config with those keys replaced:

```js
'completion-quiz': {
  source: resolve(REPO_ROOT, 'tests/fixtures/free'),
  standards: ['scorm2004'],
  overrides: { completion: { mode: 'quiz' } },
},
```

Tests then read `tests/.e2e-variants/{fixture}/{standard}/dist/` instead of touching the source fixtures. The first e2e run after `pnpm install` therefore takes ~30–60s of build time before any spec executes — that's expected.

### Fixtures are committed

Unlike many monorepos, the four fixture projects under `tests/fixtures/` are tracked in git. Only `tests/.e2e-variants/` (the per-run build output) is gitignored. Don't try to scaffold them with `npm create tessera` — the fixtures contain hand-tailored content (custom quiz components, sequential nav config, etc.) that the scaffolder doesn't produce.

If you change a fixture's content, treat it like any other source change: commit it, note in the PR description what scenario it exercises.

## Writing tests

- New features ship with tests. Bug fixes ship with a regression test that fails before the fix and passes after.
- For runtime/adapter changes (SCORM 1.2 / SCORM 2004 / cmi5 / xAPI 1.0.3 / web), prefer adding both a unit test in `packages/tessera-learn/tests/` and an e2e roundtrip if behavior is observable to the LMS.
- Keep e2e specs project-scoped: a spec should only depend on the fixture its project targets. `playwright.config.ts` enforces this with `testMatch` / `testIgnore`.
- E2E tests get isolated browser contexts automatically, so localStorage and per-test state don't leak across tests. Don't add manual `beforeEach` resets for that.

## Debugging a failing CI run

CI uploads two artifacts on failure:

- `coverage-24` — `packages/*/coverage/` from the unit-test job
- `playwright-report` — HTML report and `test-results/` traces from the e2e job

Download from the failed run's Actions page. For Playwright traces:

```bash
pnpm exec playwright show-trace path/to/trace.zip
```

## Adapter changes

Tessera supports five delivery modes — SCORM 1.2, SCORM 2004 4th Edition, cmi5, xAPI 1.0.3, and static web. If your change touches the runtime API surface or any adapter:

- Run the full e2e suite: `pnpm test:e2e`
- Note in the PR description which modes you tested and how.
