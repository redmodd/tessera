---
'tessera-learn': minor
---

Questions report their option text to the LRS: an `Interaction` option can be `{ id, text }`, which built-in questions fill in. xAPI and cmi5 send it as the Answered statement's interaction components (`choices`, `scale`, `source`/`target`, `steps`); responses keep the ids.
