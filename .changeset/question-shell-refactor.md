---
'tessera-learn': patch
---

Internal refactor with no author-facing changes: the four question widgets now share a `QuestionShell` component for their standalone-vs-quiz render, and the LMS adapter labels and cmi5 context builder were de-duplicated.
