# tessera-learn

LMS tracking runtime for interactive learning content. One adapter layer (SCORM 1.2, SCORM 2004 4th Edition, cmi5, static Web), your choice of components.

Tessera is a toolkit for building interactive online courses, designed for AI-assisted authoring: pages are `.svelte` files, the runtime locks the LMS data contract (tracking, completion, scoring, persistence), and an AI agent working in the workspace follows the conventions in `AGENTS.md` to write pages and components. This package is the runtime; you typically don't depend on it directly — `create-tessera` scaffolds a workspace that pins it for you. A workspace is one package that holds many courses under `courses/<name>/` and a `shared/` design system imported as `$shared`.

## Install

You probably don't want to install this package directly. Use the scaffolder:

```bash
pnpm create tessera@latest my-course
```

That creates a workspace with Tessera wired up, a seed course, and a root `AGENTS.md` that points to the authoring guide. Add more courses with `pnpm tessera new <name>`.

## What's included

- **Hooks** (`tessera-learn`): `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`, `useXAPI`.
- **Vite plugin** (`tessera-learn/plugin`): `tesseraPlugin()` — wires page/layout discovery, the LMS adapter, the `$shared` alias, and the export pipeline. The `tessera` CLI (`new`/`dev`/`export`/`validate`/`a11y`/`check`) runs Vite with this plugin for you, so scaffolded workspaces need no `vite.config.js`.
- **Built-in components** (`tessera-learn`): `Callout`, `Image`, `Audio`, `Video`, `Accordion` / `AccordionItem`, `Carousel` / `CarouselSlide`, `RevealModal`, `Quiz`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, `DefaultLayout`.
- **LMS adapters**: SCORM 1.2, SCORM 2004 4th Edition, cmi5, static Web — selected via `course.config.js` `export.standard`.
- **Accessibility checks**: static rules (alt text, media titles/captions, heading order, contrast, `<html lang>`) run inside validation and the build with zero extra dependencies; an opt-in runtime audit (`tessera a11y`, with `playwright` + `@axe-core/playwright` as optional peers) renders every page and gates on axe-core violations.

See `AGENTS.md` for usage, signatures, and authoring conventions.

## Documentation

The full authoring guide ships with this package at `node_modules/tessera-learn/AGENTS.md` — scaffolded projects get a small root `AGENTS.md` that points to it — and is on [GitHub](https://github.com/redmodd/tessera/blob/main/packages/tessera-learn/AGENTS.md).

## License

MIT
