---
'tessera-learn': patch
'create-tessera': patch
---

Give each quiz page its own quiz shell. Adjacent quiz pages previously shared one engine, so the second page inherited the first page's submitted state, config and questions.
