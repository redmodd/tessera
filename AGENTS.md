# AGENTS.md: Tessera Monorepo

This file is for working **on Tessera itself** — the framework runtime and its tooling.

> **Authoring a course?** The course authoring guide is **`packages/tessera-learn/AGENTS.md`**. That's the single canonical reference for writing course content; `tessera-learn` ships it, so it installs into every project at `node_modules/tessera-learn/AGENTS.md`. Scaffolded projects don't copy it — they get small `CLAUDE.md` / `AGENTS.md` pointers to it. Don't look here for authoring guidance.

---

## What this repo is

A pnpm workspace with two published packages plus an end-to-end harness:

- **`tessera-learn`** — the framework: an LMS-tracking runtime + Vite plugin + the `tessera` CLI. Svelte 5. One adapter layer over SCORM 1.2 / SCORM 2004 4th Edition / cmi5 / xAPI 1.0.3 / static web. Owns and ships the course authoring guide (`AGENTS.md`).
- **`create-tessera`** — the `npm create tessera` scaffolder. Scaffolds small `CLAUDE.md` / `AGENTS.md` pointers to `tessera-learn`'s authoring guide (no copy).

The adapter layer is the spine: `createAdapter()` picks one implementation from the course's export standard, and everything downstream stays mode-agnostic.

```ts
const adapter = createAdapter(config); // → SCORM12 | SCORM2004 | CMI5 | WebAdapter
```

## Layout

```
packages/
  tessera-learn/     # runtime + Vite plugin + tessera CLI; owns + ships AGENTS.md (the authoring guide)
  create-tessera/    # scaffolder CLI; scaffolds CLAUDE.md/AGENTS.md pointers to the guide
tests/
  e2e/               # Playwright specs across all export modes
  fixtures/          # course projects the e2e suite drives (committed)
AGENTS.md            # this file — monorepo dev guide
CONTRIBUTING.md      # setup, conventions, releases
TESTING.md           # test layout + how to run/debug
```

## Commands (from the repo root)

```bash
pnpm install
pnpm build            # build both packages (tsdown); required before e2e
pnpm test             # unit tests (Vitest) in both packages
pnpm test:coverage    # + v8 coverage under packages/*/coverage/
pnpm test:e2e         # Playwright suite (build first)
pnpm check            # verify: prettier --check + eslint + svelte-check
pnpm fix              # autofix: prettier --write + eslint --fix
pnpm changeset        # record a release note for a user-facing change
```

Node >= 24, pnpm via corepack. First-time full setup (install + build + Playwright browsers): `./scripts/setup-e2e.sh`.

Per-package or single-file runs and the e2e variant pre-build are documented in [TESTING.md](./TESTING.md).

## Conventions that bite

- **Comments are sparse and earn their place.** Code should read on its own — don't add comments that restate what the code does. Comment only the non-obvious _why_ (a workaround, an LMS quirk, a deliberate deviation), and match the comment density of the file you're editing. Prefer a clearer name or smaller function over a comment.
- **Build before e2e.** The fixtures import `tessera-learn`'s Vite plugin from its built `dist/`, so `pnpm build` must run first.
- **Fixtures are committed and hand-tailored.** `tests/fixtures/*` are tracked source, not scaffolder output — edit them like any other code; don't regenerate them with `npm create tessera`. Only `tests/.e2e-variants/` (per-run build output) is gitignored.
- **Five delivery modes, always.** Any change to the runtime API surface or an adapter must hold across SCORM 1.2 / SCORM 2004 4e / cmi5 / xAPI 1.0.3 / web. Prefer a unit test in `packages/tessera-learn/tests/` plus an e2e roundtrip, and note in the PR which modes you tested.
- **The authoring guide is owned by `tessera-learn`.** Edit `packages/tessera-learn/AGENTS.md` directly — it ships in that package's `files` field, so it installs into every scaffolded project at `node_modules/tessera-learn/AGENTS.md`. There is no copy anywhere else: `create-tessera` scaffolds only small `CLAUDE.md` / `AGENTS.md` pointers to it (templates under `packages/create-tessera/templates/base/`). The repo-root `AGENTS.md` (this file) is a separate dev guide, unrelated to the authoring guide.
- **Releases run on changesets; the two packages version-lock.** CI gates every PR on `pnpm changeset status --since=origin/main`, so **any PR that changes a file under a published package (`packages/tessera-learn/` or `packages/create-tessera/`) needs a `pnpm changeset`** — including no-API-impact refactors, their tests, and in-package docs. An _empty_ changeset does **not** satisfy the gate; use a real `patch` when there's no user-facing change. Only PRs confined to root-level files (root docs, CI, the top-level `tests/` suite) can skip it. `create-tessera` and `tessera-learn` release in lockstep (changesets `fixed`) — a changeset for either bumps both to the same version, which is what lets `create-tessera` pin `tessera-learn` to its own version. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Package internals

The directory tree is discoverable with `ls`; these are the facts that aren't.

**`tessera-learn`** — runtime (`src/runtime/`) + the Vite plugin and `tessera` CLI (`src/plugin/`, subcommands `dev` / `export` / `validate` / `a11y` / `check`).

- `dev`/`export` run Vite programmatically through the shared `buildInlineConfig()` — there is no scaffolded `vite.config.js`, and `vite` is a runtime dependency.
- Playwright and `@axe-core/playwright` are **optional peers**: the `tessera a11y` audit (Tier 2) is opt-in, so the static gate stays dependency-free.
- Exports: `.` (Svelte source), `./plugin`, `./runtime/*`. Built with tsdown.

**`create-tessera`** — one-shot scaffolder (`src/index.ts`), no `upgrade` verb. Built with tsdown to the `create-tessera` bin.

## CI

`.github/workflows/ci.yml` (Node 24): the **test** job runs install → build → `test:coverage`; the **e2e** job runs install → Playwright install → build → `test:e2e`. `release.yml` runs changesets on `main`. On failure, CI uploads `coverage-24` and `playwright-report` artifacts — see [TESTING.md](./TESTING.md#debugging-a-failing-ci-run).
