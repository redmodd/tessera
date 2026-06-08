---
'tessera-learn': patch
---

The a11y audit (`tessera a11y` and `tessera check`) now always rebuilds the course, so it never reports against a stale build. The `--build` flag is removed (the build is now unconditional).
