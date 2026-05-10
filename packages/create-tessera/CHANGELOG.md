# create-tessera

## 0.0.4

### Patch Changes

- Ship the MIT `LICENSE` file inside the package tarball. Previous versions declared `"license": "MIT"` in `package.json` but did not include the license text, which is required by the MIT terms and expected by license-auditing tools.
- Bump the scaffolded `tessera-learn` pin to `^0.0.3` so newly-created projects pick up the latest published runtime.

## 0.0.3

### Patch Changes

- Update the README on npm: add the AI-authoring framing for the project, correct the description of what the `default` vs. `bare` templates scaffold (the previous list was inaccurate), and tidy the CLI flags table (`--help`, `-h`).
- Bump the scaffolded `tessera-learn` pin to `^0.0.2` so newly-created projects pick up the latest published runtime.

## 0.0.2

### Patch Changes

- 7c9d7a5: Pin the scaffolded `tessera-learn` dependency to `^0.0.1` to match the actually-published version. Previously the scaffolder wrote `^0.1.0`, which has no matching release on npm and caused `npm install` to fail in newly-created projects.
