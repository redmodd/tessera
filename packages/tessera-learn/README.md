# tessera-learn

LMS tracking runtime for interactive learning content. One adapter layer (SCORM 1.2, SCORM 2004 4th Edition, cmi5, static Web), your choice of components.

Tessera is a toolkit for building interactive online courses, designed for AI-assisted authoring: pages are `.svelte` files, the runtime locks the LMS data contract (tracking, completion, scoring, persistence), and an AI agent working in the project follows the conventions in `AGENTS.md` to write pages and components. This package is the runtime; you typically don't depend on it directly — `create-tessera` scaffolds a project that pins it for you.

## Install

You probably don't want to install this package directly. Use the scaffolder:

```bash
pnpm create tessera@latest my-course
```

That creates a project with Tessera wired up, a starter page structure, and the authoring guide (`AGENTS.md`) at the project root. Prefer hooks-only? `pnpm create tessera@latest my-course --template=bare` scaffolds without the built-in components.

## What's included

- **Hooks** (`tessera-learn`): `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `usePersistence`, `useXAPI`.
- **Vite plugin** (`tessera-learn/plugin`): `tesseraPlugin()` — wires page/layout discovery, the LMS adapter, and the export pipeline. The `tessera` CLI (`dev`/`export`) runs Vite with this plugin for you, so scaffolded projects need no `vite.config.js`.
- **Built-in components** (`tessera-learn`): `Callout`, `Image`, `Audio`, `Video`, `Accordion` / `AccordionItem`, `Carousel` / `CarouselSlide`, `RevealModal`, `Quiz`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, `DefaultLayout`.
- **LMS adapters**: SCORM 1.2, SCORM 2004 4th Edition, cmi5, static Web — selected via `course.config.js` `export.standard`.
- **Accessibility checks**: static rules (alt text, media titles/captions, heading order, contrast, `<html lang>`) run inside validation and the build with zero extra dependencies; an opt-in runtime audit (`tessera a11y`, with `playwright` + `@axe-core/playwright` as optional peers) renders every page and gates on axe-core violations.

See `AGENTS.md` for usage, signatures, and authoring conventions.

## Documentation

The full authoring guide ships with this package at `node_modules/tessera-learn/AGENTS.md`, at the root of any scaffolded project, and on [GitHub](https://github.com/redmodd/tessera/blob/main/AGENTS.md).

## License

MIT
