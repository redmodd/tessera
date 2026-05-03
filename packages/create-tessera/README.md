# @redmondd/create-tessera

Scaffold a new [Tessera](https://www.npmjs.com/package/@redmondd/tessera) course.

## Usage

```bash
npm create @redmondd/tessera@latest my-course
```

Or equivalently:

```bash
pnpm create @redmondd/tessera my-course
yarn create @redmondd/tessera my-course
```

The scaffolder creates a new directory with:

- `course.config.js` — course metadata, navigation, completion, and export settings
- `pages/` — starter section, lesson, and page
- `assets/` — drop images, audio, and video here
- `styles/` — optional CSS overrides
- `AGENTS.md` — the full authoring guide, right in the project root (read by humans and any LLM agent working in the project)

Then:

```bash
cd my-course
npm install
npm run preview   # local dev server
npm run export    # build + package for the configured LMS standard
```

## License

MIT
