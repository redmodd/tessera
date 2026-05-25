---
'tessera-learn': patch
---

Move the build-time validator's structure parsing onto Svelte's own AST
(`svelte/compiler`), retiring the hand-rolled tag/attribute scanner
(`parseTagProps`) and the balanced-brace matcher (`extractObjectLiteral`) in
favor of one shared `ast.ts`. Value evaluation stays on JSON5, so static
prop/config values are read identically — only structure parsing moved.

- **Fewer false negatives.** Question/media components the regex scanner used to
  skip silently — e.g. a tag carrying a `:` directive (`class:`, `bind:`,
  `transition:`), or anything that made the hand-rolled prop parser bail — are
  now validated with the same checks and severities.
- **Comments and string-embedded tags no longer match.** A commented-out or
  string-embedded `<MultipleChoice …>` is no longer scanned as live markup.
- **Syntax errors surface.** A page Svelte can't parse is now reported as a
  validator error (`… could not parse — <message>`), so `tessera-validate`
  (which never compiles) catches them too; the rest of that page's content
  checks are skipped to avoid cascading noise.

No public API change. `course.config.js` / `pageConfig` value semantics, message
strings, and severities are unchanged, and the spread-fed required-prop
suppression is preserved (covered by regression tests).
