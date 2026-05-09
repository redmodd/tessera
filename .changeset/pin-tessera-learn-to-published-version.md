---
"create-tessera": patch
---

Pin the scaffolded `tessera-learn` dependency to `^0.0.1` to match the actually-published version. Previously the scaffolder wrote `^0.1.0`, which has no matching release on npm and caused `npm install` to fail in newly-created projects.
