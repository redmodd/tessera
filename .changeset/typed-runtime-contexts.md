---
'tessera-learn': patch
---

The runtime contexts now use Svelte's `createContext`, so `tessera-learn` needs `svelte` 5.57.0 or later. The `TESSERA_NAV`, `TESSERA_ADAPTER`, `TESSERA_PAGE`, `TESSERA_IN_PAGE` and `TESSERA_USER_STATE` string keys are no longer exported from `tessera-learn/runtime/contexts`; read these contexts through the hooks instead.
