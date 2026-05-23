# Contributing to Tessera

Thanks for your interest in contributing. This document covers how to get the repo running locally, the conventions the project follows, and how releases work.

## Prerequisites

- Node.js >= 24 (CI runs Node 24)
- [pnpm](https://pnpm.io/) (the repo is a pnpm workspace; corepack will pick the right version automatically)

## Getting set up

```bash
git clone https://github.com/redmodd/tessera.git
cd tessera
./scripts/setup-e2e.sh   # pnpm install + build + Playwright browsers
pnpm test
pnpm test:e2e
```

If you only need unit tests, `pnpm install && pnpm build && pnpm test` is enough. The setup script is a convenience for getting the full e2e suite running.

See [TESTING.md](./TESTING.md) for the test layout, single-file runs, the variant pre-build, and debugging tips.

## Repo layout

```
packages/
  tessera-learn/     # Framework runtime + Vite plugin
  create-tessera/    # Scaffolder (owns the course authoring guide)
tests/
  e2e/               # Playwright specs
  fixtures/          # Course projects used by e2e (committed)
AGENTS.md            # Monorepo dev guide (working on Tessera itself)
```

## Editing the authoring guide

The course authoring guide lives at `packages/create-tessera/AGENTS.md`. Edit it there — it's published with the scaffolder (via the package `files` field) and copied into every scaffolded project by `packages/create-tessera/src/index.ts` (and overwritten by `create-tessera upgrade`). The repo-root `AGENTS.md` is a separate document: the monorepo dev guide for working on Tessera itself.

## Branch + commit style

- Branch off `main`. Use a short prefix for the branch name (`feat/`, `fix/`, `chore/`, `docs/`).
- Commit messages follow Conventional Commits-ish prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). The repo's existing history is the best reference.
- Keep PRs focused. If you find unrelated cleanup along the way, prefer a separate PR.

## Tests

- Unit tests: `pnpm test` (Vitest, runs in both packages). Add `:coverage` for v8 reports.
- E2E: `pnpm test:e2e`. If you change adapter behavior (SCORM 1.2, SCORM 2004, cmi5, web) or navigation/progress logic, run the e2e suite locally before opening a PR.
- New features should ship with tests. Bug fixes should ship with a regression test that fails before your change and passes after.

See [TESTING.md](./TESTING.md) for full details: single-test runs, the variant pre-build that produces `tests/.e2e-variants/`, debugging failed CI runs, etc.

## Adapter changes

Tessera supports four delivery modes: SCORM 1.2, SCORM 2004 4th Edition, cmi5, and static web. If your change touches the runtime API surface or any adapter:

- Check that the change works (or is appropriately gated) in every mode.
- Note in the PR description which modes were tested and how.

## Releases

Releases are managed by [changesets](https://github.com/changesets/changesets). When your PR contains a user-facing change to either published package:

```bash
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a one-line summary aimed at end users. Commit the generated file in `.changeset/`.

`create-tessera` and `tessera-learn` are version-locked (changesets `fixed`): a changeset for either one releases **both** at the same new version, so they always share a version number. This is what lets `create-tessera` pin `tessera-learn` to its own version.

Internal changes (docs, CI, refactors with no API impact) don't need a changeset.

A "Version Packages" PR is opened automatically once changesets land on `main`. Merging it triggers the publish workflow.

## Reporting bugs / requesting features

Use the issue templates on GitHub. For bugs, please include the export mode (SCORM 1.2 / SCORM 2004 / cmi5 / web) and the LMS (if applicable). Adapter behavior is highly sensitive to LMS quirks.

## Code of conduct

Be kind and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) v2.1.
