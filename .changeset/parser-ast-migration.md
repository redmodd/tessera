---
'tessera-learn': patch
---

The build-time validator catches a few cases the previous regex-based scanner
silently skipped. No public API change; `course.config.js` / `pageConfig` value
semantics, message strings, and severities are unchanged.

- **Fewer false negatives.** Question/media components carrying a `:` directive
  (`class:`, `bind:`, `transition:`) — which the regex scanner used to bail
  on — are now validated like any other tag.
- **Comments and string-embedded tags no longer match.** A commented-out or
  string-embedded `<MultipleChoice …>` is no longer scanned as live markup.
- **Syntax errors surface.** A page Svelte can't parse is reported as
  `… could not parse — <message>`, so `tessera validate` (which never
  compiles) catches them too; other content checks on that page are skipped
  to avoid cascading noise.
