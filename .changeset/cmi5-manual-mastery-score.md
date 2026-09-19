---
'tessera-learn': patch
---

Passed and Failed statements from a manual-completion cmi5 course keep their score. The cmi5 package no longer declares `masteryScore` under `completion.mode: "manual"`, where success comes from `requireSuccessStatus` instead.
