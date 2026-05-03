# Changesets

This directory contains [changesets](https://github.com/changesets/changesets) — files describing user-facing changes that should land in the next release.

## Adding a changeset

```bash
pnpm changeset
```

Pick the affected package(s), choose `patch` / `minor` / `major`, and write a one-line summary aimed at end users. Commit the generated `.md` file alongside your code change.

Internal-only changes (docs, CI, refactors with no API impact) don't need a changeset.

## How releases happen

Once changesets land on `main`, the Release workflow opens (or updates) a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`. Merging that PR publishes the new versions to npm.
