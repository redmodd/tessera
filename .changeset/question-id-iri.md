---
'tessera-learn': patch
---

cmi5 and xAPI Answered statements percent-encode the question id in the activity id, so an id with a space or `#` still sends a valid IRI.
