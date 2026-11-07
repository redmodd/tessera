---
'tessera-learn': patch
---

A question without an `id` derives one that keeps its prompt's letters: accented Latin letters drop their accents (`Café?` → `mc-cafe`) and letters of other scripts record as code points (`東京は？` → `mc-u6771u4eacu306f`), so prompts in other scripts no longer derive the same id.
