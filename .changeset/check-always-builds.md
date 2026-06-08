---
'tessera-learn': patch
---

`tessera check` now always rebuilds the course before the a11y audit, so it never reports against a stale build. Previously it reused `node_modules/.tessera-a11y/` whenever that build existed, regardless of source changes; you had to pass `--build` to get a correct result. Bare `tessera a11y` still reuses an existing build by default (`--build` to force).
