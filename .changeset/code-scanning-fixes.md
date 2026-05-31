---
'tessera-learn': patch
'create-tessera': patch
---

fix: address CodeQL code-scanning alerts. Switch the e2e/scaffold test helpers from shell-string `exec`/`execSync` to arg-array `execFile`/`execFileSync` (no shell, no injection), and add a least-privilege top-level `permissions: contents: read` to the CI workflow. Separately, tidy up the heading-order lint's tag stripping in `validation.ts` to loop until stable — a correctness improvement for nested/reconstructed markup that also clears two CodeQL sanitization findings (which were false positives: the stripped output only counts heading tags for an author-facing warning, it's never rendered or trusted). No runtime behavior changes.
