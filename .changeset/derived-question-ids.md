---
'tessera-learn': patch
---

Questions without an `id` keep accented letters in their derived id, and a prompt with a character outside ASCII in the part the id covers also gets a short hash (`Café?` → `mc-cafe-1htl0nt`, `東京は？` → `mc-1u6y6gm`), so such prompts no longer share one id. The export zip name keeps accented letters of the course title (`Café` → `cafe-1.0.0.zip`).
