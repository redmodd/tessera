---
'tessera-learn': patch
---

Export packages the configured `build.outDir` instead of always `dist/`, and a build now fails if `outDir` is or contains the project root. `tesseraPlugin()` also throws on an unknown `standardOverride` instead of reporting it as a validation error.
