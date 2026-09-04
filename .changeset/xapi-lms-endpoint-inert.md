---
'tessera-learn': patch
---

Treat `xapi.endpoint: 'lms'` as an ignored entry with a build warning under scorm12/scorm2004/web, and skip the xAPI runtime when it is the only entry, so one course config exports to every standard.
