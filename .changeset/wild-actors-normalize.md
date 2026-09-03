---
'tessera-learn': patch
'create-tessera': patch
---

Reshape Person-shaped xAPI/cmi5 launch actors into a valid Agent instead of forwarding them to the LRS.
Reject a non-`Agent` `objectType` on a static `xapi.actor` at build time.
