---
'tessera-learn': minor
---

**Breaking:** `tessera-learn` now needs `svelte` 5.57.0 or later. To upgrade, run `pnpm add -D svelte@^5.57.0`. The `TESSERA_NAV`, `TESSERA_ADAPTER`, `TESSERA_PAGE`, `TESSERA_IN_PAGE` and `TESSERA_USER_STATE` keys are no longer exported from `tessera-learn/runtime/contexts`, and `getContext('tessera-nav')` and the other `'tessera-*'` string keys now return `undefined`. Read these contexts through the hooks instead.
