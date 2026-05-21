---
"tessera-learn": patch
---

- **Standalone graded questions now count toward the LMS score.** A course graded entirely through standalone `useQuestion({ graded: true })` previously reported `success_status` but never called `adapter.setScore`, leaving `cmi.score.raw` unset; the score and success status could also disagree when both quizzes and standalone questions existed. Both are now derived from one source (`ProgressState.gradedScore()`), and the score-reporting effect commits only when the rounded score actually changes — so page turns no longer re-issue redundant `setScore` / `setDuration` / `commit()` round-trips.

- **Consistent `$assets/` resolution in media components.** `Image`, `Audio`, and `Video` now resolve `src` through the shared `resolveAsset()` helper using one document-relative `./assets/` form that works at the domain root, under an LMS subpath, and over `file://`. Previously `Image` used a root-relative `/assets/` prefix and `Audio` / `Video` emitted the literal `$assets/` URL unresolved. A missing/empty `src` renders an empty `<source>` instead of throwing.

- **Framework bundle emitted to `dist/tessera/`.** Vite's hashed JS/CSS chunks now live in `dist/tessera/`, leaving `dist/assets/` for user media only, so a host can apply an immutable long-cache rule to the bundle without risking stale media. No author-facing change — courses keep referencing media via `$assets/...`.

Also includes a series of internal refactors (config read/parse, shared validation/auth-credential rules, adapter cleanup, plugin restructuring) with no change to runtime behavior.
