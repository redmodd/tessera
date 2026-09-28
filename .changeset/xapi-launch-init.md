---
'tessera-learn': patch
---

The cmi5 and xAPI adapters share one launch sequence. A cmi5 launch with a missing or relative `endpoint` or a missing `activityId` fails before spending the single-use fetch URL, instead of sending the auth token to the course's own host.
