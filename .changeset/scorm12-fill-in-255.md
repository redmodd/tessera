---
'tessera-learn': patch
---

SCORM 1.2 and SCORM 2004 now record the first part of an over-long interaction response, with a console warning, instead of losing the whole response when a strict LMS rejects it. The cap is 255 characters on SCORM 1.2, and on SCORM 2004 it is 250 for fill-in and 4000 for long-fill-in and other. List answers keep only whole items, and a correct answer over the cap is left out of the LMS record. `tessera validate` flags `<FillInTheBlank>` answers over the cap.
