# AGENTS.md: Tessera Monorepo

This file is for working **on Tessera itself** — the framework runtime and its tooling.

> **Authoring a course?** The course authoring guide is **`packages/create-tessera/AGENTS.md`**. That's the canonical reference for writing course content, and it's the file shipped into every scaffolded project (copied by the scaffolder, overwritten by `create-tessera upgrade`). Don't look here for authoring guidance.

---

## What this repo is

A pnpm workspace with two published packages plus an end-to-end harness:

- **`tessera-learn`** — the framework: an LMS-tracking runtime + Vite plugin. Svelte 5. One adapter layer over SCORM 1.2 / SCORM 2004 4th Edition / cmi5 / static web.
- **`create-tessera`** — the `npm create tessera` scaffolder. It owns and ships the course authoring guide (`AGENTS.md`).

## Layout

```
packages/
  tessera-learn/     # runtime + Vite plugin (src/, built with tsdown → dist/)
  create-tessera/    # scaffolder CLI; owns AGENTS.md (the authoring guide)
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
pnpm lint
pnpm changeset        # record a release note for a user-facing change
```

Node >= 24, pnpm via corepack. First-time full setup (install + build + Playwright browsers): `./scripts/setup-e2e.sh`.

Per-package or single-file runs and the e2e variant pre-build are documented in [TESTING.md](./TESTING.md).

## Conventions that bite

- **Comments are sparse and earn their place.** Code should read on its own — don't add comments that restate what the code does. Comment only the non-obvious *why* (a workaround, an LMS quirk, a deliberate deviation), and match the comment density of the file you're editing. Prefer a clearer name or smaller function over a comment.
- **Build before e2e.** The fixtures import `tessera-learn`'s Vite plugin from its built `dist/`, so `pnpm build` must run first.
- **Fixtures are committed and hand-tailored.** `tests/fixtures/*` are tracked source, not scaffolder output — edit them like any other code; don't regenerate them with `npm create tessera`. Only `tests/.e2e-variants/` (per-run build output) is gitignored.
- **Four delivery modes, always.** Any change to the runtime API surface or an adapter must hold across SCORM 1.2 / SCORM 2004 4e / cmi5 / web. Prefer a unit test in `packages/tessera-learn/tests/` plus an e2e roundtrip, and note in the PR which modes you tested.
- **The authoring guide is owned by `create-tessera`.** Edit `packages/create-tessera/AGENTS.md` directly. It's published via that package's `files` field and copied into scaffolded projects by `packages/create-tessera/src/index.ts`. There is no root↔package sync step.
- **Releases run on changesets; the two packages version-lock.** CI gates every PR on `pnpm changeset status --since=origin/main`, so **any PR that changes a file under a published package (`packages/tessera-learn/` or `packages/create-tessera/`) needs a `pnpm changeset`** — including no-API-impact refactors, their tests, and in-package docs. An *empty* changeset does **not** satisfy the gate; use a real `patch` when there's no user-facing change. Only PRs confined to root-level files (root docs, CI, the top-level `tests/` suite) can skip it. `create-tessera` and `tessera-learn` release in lockstep (changesets `fixed`) — a changeset for either bumps both to the same version, which is what lets `create-tessera` pin `tessera-learn` to its own version. See [CONTRIBUTING.md](./CONTRIBUTING.md).

## Package internals (quick map)

- **`tessera-learn`** — `src/runtime/` (state, completion/success rollup, navigation gating, the SCORM/cmi5/web adapters) and `src/plugin/` (the Vite plugin and the `tessera-validate` CLI). Exports: `.` (Svelte source), `./plugin`, `./runtime/*`. Built with tsdown.
- **`create-tessera`** — `src/index.ts` drives both scaffold and `upgrade`. Built with tsdown to `dist/index.js` (the `create-tessera` bin).

## CI

`.github/workflows/ci.yml` (Node 24): the **test** job runs install → build → `test:coverage`; the **e2e** job runs install → Playwright install → build → `test:e2e`. `release.yml` runs changesets on `main`. On failure, CI uploads `coverage-24` and `playwright-report` artifacts — see [TESTING.md](./TESTING.md#debugging-a-failing-ci-run).
