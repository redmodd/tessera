---
'tessera-learn': patch
'create-tessera': patch
---

New workspaces ignore exported packages (`*.zip`) in git, so SCORM, cmi5 and xAPI exports no longer get committed with the course.

Existing workspaces: add `*.zip` to the workspace `.gitignore`.
