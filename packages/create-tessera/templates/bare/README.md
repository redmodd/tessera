# __PROJECT_TITLE__

Bare Tessera project. The course shell lives in `layout.svelte` at the project
root and pages live under `pages/`. Built-in components are not imported by
default — bring your own UI.

## Run locally

```bash
npm install
npm run dev
```

## Structure

- `layout.svelte` — course shell (header / main / footer)
- `pages/` — sections → lessons → `.svelte` pages
- `course.config.js` — title, navigation, completion, scoring, export target
- `AGENTS.md` — authoring guide

## Build

```bash
npm run export
```
