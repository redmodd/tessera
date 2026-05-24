---
'tessera-learn': patch
---

Close build-time validation gaps for config fields and component props that were
modeled but never checked, so authors get a diagnostic instead of silent
misbehavior:

- **`quiz.feedbackMode` / `quiz.retryMode`** — enum-checked (errors on a typo
  like `feedbackMode: "imediate"` that previously fell through to the default).
- **`title`** — warns when missing or empty (ships as `"Untitled Course"`),
  errors when set to a non-string (the merge passes it through truthy).
- **Question `weight`** — warns when ignored (a string like `weight="2"`, or a
  non-positive value coerced to `1`); errors on a non-finite literal
  (`weight={Infinity}`) that would make the weighted score `NaN`.
- **Question `id` under SCORM 1.2** — warns when `shortIdentifier` would rewrite
  it (spaces/punctuation/border underscores) and errors on a post-sanitization
  collision (`q-1` vs `q_1`). scorm12-only; deduped against the existing
  raw-duplicate check.
- **`MultipleChoice.optionFeedback`** — warns when it has more entries than
  `options` (the overflow can never be shown).
- **`scoring.passingScore`** — nudges (warning) when `completion.mode: "quiz"`
  leaves it implicit at the default 70%.
- **`branding`** — format-only warnings for a non-string/`$assets`-prefixed
  `logo`, an unparseable `primaryColor`, and a non-string `fontFamily`.
- **Empty sections** — warns when a section contributes no pages.

`shortIdentifier` is now exported from `runtime/interaction-format.ts` and used
as the single source of truth for the SCORM 1.2 id check (no duplicated regex).
`validateQuestionComponents` gained `warnings`/`exportStandard` channels, threaded
through `validatePages` → `validatePageFile`. No public API change.
