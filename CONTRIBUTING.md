# Contributing to Tessera

Thanks for your interest in contributing. This document covers how to get the repo running locally, the conventions the project follows, and how releases work.

## Prerequisites

- Node.js >= 20 (CI tests against 20 and 22)
- [pnpm](https://pnpm.io/) (the repo is a pnpm workspace; corepack will pick the right version automatically)

## Getting set up

```bash
git clone https://github.com/redmodd/tessera.git
cd tessera
pnpm install
pnpm build
pnpm test
```

For end-to-end Playwright tests:

```bash
pnpm exec playwright install --with-deps chromium
pnpm test:e2e
```

E2E suites are scoped via Playwright projects (`free-mode`, `sequential-mode`, `mobile`, `lms`) — see `playwright.config.ts`. The fixture projects under `tests/fixtures/` are gitignored; scaffold them with `npm create tessera@latest` or copy from a previous checkout if you need them.

## Repo layout

```
packages/
  tessera/           # Framework runtime + Vite plugin
  create-tessera/    # Scaffolder
tests/
  e2e/               # Playwright specs
  fixtures/          # Local-only scaffolded courses (gitignored)
AGENTS.md            # Course authoring guide
```

## Branch + commit style

- Branch off `main`. Use a short prefix for the branch name (`feat/`, `fix/`, `chore/`, `docs/`).
- Commit messages follow Conventional Commits-ish prefixes (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`). The repo's existing history is the best reference.
- Keep PRs focused. If you find unrelated cleanup along the way, prefer a separate PR.

## Tests

- Unit tests: `pnpm test` (Vitest, runs in both packages).
- E2E: `pnpm test:e2e`. If you change adapter behavior (SCORM 1.2, SCORM 2004, cmi5, web) or navigation/progress logic, run the E2E suite locally before opening a PR.
- New features should ship with tests. Bug fixes should ship with a regression test that fails before your change and passes after.

## Adapter changes

Tessera supports four delivery modes — SCORM 1.2, SCORM 2004 4th Edition, cmi5, and static web. If your change touches the runtime API surface or any adapter:

- Check that the change works (or is appropriately gated) in every mode.
- Note in the PR description which modes were tested and how.

## Releases

Releases are managed by [changesets](https://github.com/changesets/changesets). When your PR contains a user-facing change to either published package:

```bash
pnpm changeset
```

Pick the affected packages, choose `patch` / `minor` / `major`, and write a one-line summary aimed at end users. Commit the generated file in `.changeset/`.

Internal changes (docs, CI, refactors with no API impact) don't need a changeset.

A "Version Packages" PR is opened automatically once changesets land on `main`. Merging it triggers the publish workflow.

## Reporting bugs / requesting features

Use the issue templates on GitHub. For bugs, please include the export mode (SCORM 1.2 / SCORM 2004 / cmi5 / web) and the LMS (if applicable) — adapter behavior is highly sensitive to LMS quirks.

## Code of conduct

Be kind and constructive. We follow the [Contributor Covenant](https://www.contributor-covenant.org/version/2/1/code_of_conduct/) v2.1.
