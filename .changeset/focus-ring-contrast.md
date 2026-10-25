---
'tessera-learn': minor
---

**Breaking:** `--tessera-focus-ring` is gone. To upgrade, wherever you set or read it, use `--tessera-focus-outline` as an `outline` (default `2px solid var(--tessera-text)`) and `--tessera-focus-halo` as a `box-shadow` (default `0 0 0 4px var(--tessera-bg)`).

The focus ring meets 3:1 contrast on any background and shows in forced-colors mode, and it no longer takes `branding.primaryColor`. It is no longer clipped in the sidebar or the accordion, and headings focused only for screen readers (`tabindex="-1"`) show no ring. New `--tessera-shadow-sm` and `--tessera-shadow-lg` tokens set the shadows on the mobile menu button and Sorting cards, and on the exit dialog and RevealModal.
