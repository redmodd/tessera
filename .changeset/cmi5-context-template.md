---
'tessera-learn': patch
---

cmi5 Answered statements and `useXAPI()` statements to `endpoint: 'lms'` start from the LMS's context template, so they keep its publisher grouping and extensions. cmi5 statements other than Answered also keep the launch activity in their grouping unless the author sets one.
