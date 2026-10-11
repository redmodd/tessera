# tessera-learn

LMS tracking runtime for interactive learning content. One adapter layer (SCORM 1.2, SCORM 2004 4th Edition, cmi5, xAPI 1.0.3, static Web), your choice of components.

Tessera is a toolkit for building interactive online courses, designed for AI-assisted authoring: pages are `.svelte` files, the runtime locks the LMS data contract (tracking, completion, scoring, navigation, persistence), and an AI assistant working in the workspace follows the conventions in `AGENTS.md` to write pages and components. This package is the runtime; you typically don't depend on it directly, because `create-tessera` scaffolds a workspace that pins it for you. A workspace is one package that holds many courses under `courses/<name>/` and a `shared/` design system imported as `$shared`.

## Install

Use the scaffolder:

```bash
pnpm create tessera@latest my-courses
```

That creates a workspace with Tessera wired up, a seed course, and a root `AGENTS.md` that points to the authoring guide. Add more courses with `pnpm tessera new <name>`.

## What's included

- **Hooks** (`tessera-learn`): `useQuestion`, `useQuiz`, `useNavigation`, `useProgress`, `useCompletion`, `usePersistence`, `useCourse`, `useXAPI`.
- **Vite plugin** (`tessera-learn/plugin`): `tesseraPlugin()` wires page/layout discovery, the LMS adapter, the `$shared` alias, and the export pipeline. The `tessera` CLI (`new`/`duplicate`/`dev`/`export`/`validate`/`a11y`/`check`) runs Vite with this plugin for you, so scaffolded workspaces need no `vite.config.js`.
- **Built-in components** (`tessera-learn`): `Callout`, `Image`, `Audio`, `Video`, `Accordion` / `AccordionItem`, `Carousel` / `CarouselSlide`, `RevealModal`, `Quiz`, `MultipleChoice`, `FillInTheBlank`, `Matching`, `Sorting`, `DefaultLayout`.
- **LMS adapters**: SCORM 1.2, SCORM 2004 4th Edition, cmi5, xAPI 1.0.3 ("Tin Can"), static Web. Selected via `course.config.js` `export.standard`, or overridden per build with `tessera export --standard <value>`.
- **Accessibility checks**: static rules (alt text, media titles/captions, heading order, contrast, `<html lang>`) run inside validation and the build with zero extra dependencies; an opt-in runtime audit (`tessera a11y`, with `playwright` + `@axe-core/playwright` as optional peers) renders every page and gates on axe-core violations.

## Documentation

Guides and examples: [tesseralearn.dev](https://tesseralearn.dev).

The authoring guide ships with this package: `node_modules/tessera-learn/AGENTS.md` holds what every task needs and routes the rest to the reference files in `node_modules/tessera-learn/docs/`. Scaffolded workspaces get a small root `AGENTS.md` that points to it. It is also on [GitHub](https://github.com/redmodd/tessera/blob/main/packages/tessera-learn/AGENTS.md).

## License

MIT
