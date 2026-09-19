---
'tessera-learn': patch
---

cmi5 packages omit `masteryScore` under `completion.mode: "manual"`, where success comes from `requireSuccessStatus` rather than the score. Failed statements (and Passed ones under an author-set `scoring.passingScore`) keep their score instead of being sent without it. `tessera validate` now warns when `scoring.passingScore` is set under manual completion.
