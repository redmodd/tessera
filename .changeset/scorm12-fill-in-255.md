---
'tessera-learn': patch
---

SCORM 1.2 now records the first part of an over-long interaction response, and SCORM 2004 of an over-long text or performance step answer, instead of losing the whole response when a strict LMS rejects it. `tessera validate` flags `<FillInTheBlank>` answers the LMS record leaves out: those too long for it, and those past the 10th. It also no longer treats a shorthand prop like `{src}` as a spread, so it still checks that component's alt text, title and other required props.
