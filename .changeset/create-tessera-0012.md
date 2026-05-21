---
"create-tessera": patch
---

- Bump the scaffolded `tessera-learn` pin to `^0.0.11` so newly-created projects pick up the standalone-question LMS score fix, consistent `$assets/` resolution across the media components, and the relocated framework bundle (`dist/tessera/`).

- Pin `"types": ["node"]` in the package tsconfig so a standalone `tsc -p packages/create-tessera/tsconfig.json` type-checks clean (it was reporting phantom missing-`process` / `node:*` errors). No change to the scaffolded output or CLI behavior.
