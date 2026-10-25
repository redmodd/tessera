---
'tessera-learn': patch
---

The focus ring is a 2px outline in `--tessera-text` with a `--tessera-bg` halo, so it meets 3:1 contrast on any background and shows in forced-colors mode. It is no longer clipped in the sidebar or the accordion, and headings focused only for screen readers (`tabindex="-1"`) show no ring. `--tessera-focus-ring` is replaced by `--tessera-focus-outline` and `--tessera-focus-halo`. New `--tessera-shadow-sm` and `--tessera-shadow-lg` tokens set the shadows on the mobile menu button and Sorting cards, and on the exit dialog and RevealModal.
