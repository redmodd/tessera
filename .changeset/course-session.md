---
'tessera-learn': patch
---

Closing the course while an `xapi` actor resolver is still running now ends the LMS session instead of leaving the attempt open. `useXAPI()` returns `null` once the session has ended.
