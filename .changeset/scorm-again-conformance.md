---
'tessera-learn': patch
---

Test-only: harden the SCORM adapter test suites against `scorm-again`, a
spec-implementing LMS-side CMI runtime, instead of relying solely on the
always-`true` hand-rolled doubles. No public API or runtime behavior change.

- Adds `scorm-again` as an **exact-pinned** devDependency (its validation
  strictness is part of the test contract — do not auto-bump).
- New `tests/helpers/real-lms.ts` wraps `Scorm12API` / `Scorm2004API` in an
  instrumented double that captures rejected writes at each call site (the
  adapter's async retry queue swallows failures, so `GetLastError` polling is
  racy — the wrapper reads it synchronously the instant a call returns).
- New `scorm12-conformance.test.ts` / `scorm2004-conformance.test.ts` drive the
  adapters against the real data model and assert no spec-illegal writes,
  reading state back where elements are readable. The existing mock suites are
  retained for fault injection (forced `'false'`, thrown calls, error codes)
  and serialization detail.
