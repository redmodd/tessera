---
'tessera-learn': minor
---

**Breaking:** Theme colors and fonts now live in one place, your course CSS. Set `--tessera-primary` and `--tessera-font-family` on `:root` in `styles/` in place of `branding.primaryColor` and `branding.fontFamily`, which are removed. `tessera a11y` checks contrast as rendered, replacing the `tessera/primary-contrast` rule.
