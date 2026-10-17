---
'tessera-learn': patch
---

SCORM 1.2 now records the first 255 characters of an interaction response, with a console warning, instead of losing the whole response when a strict LMS such as SCORM Cloud rejects a longer one. List answers (choice, sequencing, matching, performance) keep only whole items, and a correct answer over 255 characters is left out of the LMS record.
