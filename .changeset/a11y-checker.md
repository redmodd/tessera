---
'tessera-learn': patch
'create-tessera': patch
---

Add an accessibility checker spanning three non-overlapping tiers, plus the
component and config changes that make an accessible result expressible.

**Tier 0 — components correct by construction.**

- `Image` — `alt` is no longer silently optional; add a `decorative` boolean so
  "forgot alt" is distinguishable from "intentionally ornamental" (renders empty
  `alt` + `aria-hidden`).
- `Video` / `Audio` — `title` (the accessible name) is required; add `tracks`
  (rendered as `<track>` on native players) and `transcript` (a `<details>`
  disclosure).
- `<html lang>` — new top-level `language` config field (BCP-47, default `'en'`)
  interpolated into the generated HTML instead of a hardcoded `lang="en"`.

**Tier 1 — static analyzer (build + dev, zero new runtime deps).**

- _1a_ routes the Svelte compiler's `a11y_*` warnings (filtered to author files)
  through the validation reporter and gates them at `buildEnd`.
- _1b_ adds tessera-specific rules: `<Image>` alt-or-decorative, `<Video>`/
  `<Audio>` title + captions/transcript, empty question option/answer labels,
  skipped heading levels, `branding.primaryColor` contrast against white, and a
  well-formed `language` tag.

**Tier 2 — runtime auditor.** New `tessera-a11y` bin drives Playwright + axe-core
over every page of a built course, writes `a11y-report.json`, and exits non-zero
on violations at/above an impact threshold (default `serious`). Playwright and
`@axe-core/playwright` are optional — the command exits with an actionable
message when they're absent, so the static gate carries no new dependency.

**Config.** New `a11y` block: `level` (`warn` | `error`, promotes the heuristic
rules and 1a), `standard` (axe ruleset tags), and `ignore` (a flat per-rule
escape hatch matched literally against each diagnostic's ID across all tiers).

The scaffolded `course.config.js` now ships `language: 'en'` so fresh courses
start clean, and the scaffold adds a reserved `accessibility-check` npm script
(→ `tessera-a11y`) alongside `dev` / `export` / `validate`; `upgrade` reconciles
it into existing projects.
