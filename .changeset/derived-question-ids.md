---
'tessera-learn': patch
---

A question without an `id` derives one that keeps accented letters without their accents (`Café?` → `mc-cafe`) and adds a short hash when the prompt has letters, digits or symbols ASCII cannot spell (`東京は？` → `mc-1u6y6gm`), so such prompts no longer derive the same id.
