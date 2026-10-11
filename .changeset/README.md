# Changesets

This directory contains [changesets](https://github.com/changesets/changesets): files describing the changes that land in the next release. Each one becomes an entry in the package's `CHANGELOG.md`, which is what end users read.

## Adding a changeset

```bash
pnpm changeset
```

Pick the affected package(s), choose `patch` / `minor` / `major`, and write a few short sentences aimed at end users. Lead with what they will notice, not how the code changed. Commit the generated `.md` file alongside your code change.

Any PR that changes a file under `packages/tessera-learn/` or `packages/create-tessera/` needs a changeset, including refactors, tests and in-package docs. CI gates on it, and an empty changeset does not pass. When there is no user-facing change, add a `patch` that says so. Only PRs confined to root-level files can skip it. See [CONTRIBUTING.md](../CONTRIBUTING.md#releases).

## How releases happen

Once changesets land on `main`, the Release workflow opens (or updates) a "Version Packages" PR that bumps versions and updates `CHANGELOG.md`. Merging that PR publishes the new versions to npm.
