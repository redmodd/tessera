---
'tessera-learn': minor
---

**Breaking:** `branding.primaryColor` and `branding.fontFamily` are gone, and the build warns that it ignores them. To upgrade, set `--tessera-primary` and `--tessera-font-family` on `:root` in `styles/`. The `tessera/primary-contrast` rule goes with them: run `tessera a11y` to check contrast.
