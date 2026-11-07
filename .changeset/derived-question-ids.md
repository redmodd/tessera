---
'tessera-learn': patch
---

Questions without an `id` keep accented letters in their derived id (`Café?` → `mc-cafe`), and prompts ASCII cannot spell get a short hash (`東京は？` → `mc-1u6y6gm`), so they no longer share one id.
