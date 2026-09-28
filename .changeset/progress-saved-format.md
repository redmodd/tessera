---
'tessera-learn': patch
---

Internal refactor of how resume data is saved and restored. The saved format is unchanged, so existing learner progress still resumes. Resume now ignores saved progress for pages the course does not have, and discards a save with a malformed question result.
