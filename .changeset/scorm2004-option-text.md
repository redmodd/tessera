---
'tessera-learn': minor
---

**Behavior change:** SCORM 2004 reports show answer text: a choice, sequencing or matching option with text records as its position and text (`3.Paris_France`) in `learner_response` and `correct_responses`, in place of its id. Built-in questions always pass option text, so an LMS report that spans the upgrade shows the same answer under two values. Rewording an option also changes its recorded value.
