---
'tessera-learn': patch
---

SCORM 1.2 writes `lesson_status` once per commit and only when it changes, so the LMS no longer sees a brief `completed` before `failed`, on relaunch or when completion and a verdict arrive together.
