---
'tessera-learn': patch
'create-tessera': patch
---

fix: resolve CodeQL code-scanning alerts. Harden the heading-order lint's tag stripping in `validation.ts` to loop until stable (closes the incomplete multi-character sanitization finding), and switch e2e/scaffold test helpers from shell-string `exec`/`execSync` to arg-array `execFile`/`execFileSync` (no shell, no injection). Also add a least-privilege top-level `permissions: contents: read` to the CI workflow. No runtime behavior changes.
