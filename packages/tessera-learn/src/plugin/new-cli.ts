import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { findWorkspaceRoot } from './course-root.js';
import { validateProjectName, toTitleCase } from './project-name.js';
import { copyTemplate } from './template-copy.js';
import { resolvePackageRoot } from './package-root.js';

// `tessera new <name>` — stamp a new course into courses/<name> inside the
// current workspace. No install step: the workspace already owns the deps.
export function runNew(name: string | undefined, cwd: string): number {
  if (name === '--help' || name === '-h') {
    console.log(
      'Usage: tessera new <name>\n\n' +
        'Scaffold a new course into courses/<name> inside the current workspace.',
    );
    return 0;
  }
  if (!name) {
    console.error('Usage: tessera new <name>');
    return 1;
  }

  const nameError = validateProjectName(name);
  if (nameError) {
    console.error(`[tessera new] ${nameError}`);
    return 1;
  }

  const workspaceRoot = findWorkspaceRoot(resolve(cwd));
  if (!workspaceRoot) {
    console.error(
      '[tessera new] Not inside a Tessera workspace — run this from a workspace (a directory with a `courses/` folder).',
    );
    return 1;
  }

  const courseDir = join(workspaceRoot, 'courses', name);
  if (existsSync(courseDir)) {
    console.error(`[tessera new] Course "${name}" already exists.`);
    return 1;
  }

  const templateDir = join(resolvePackageRoot(), 'templates', 'course');
  copyTemplate(templateDir, courseDir, {
    PROJECT_NAME: name,
    PROJECT_TITLE: toTitleCase(name),
  });

  const rel = relative(workspaceRoot, courseDir);
  console.log(`\nCreated ${rel}.\n\nNext steps:\n  tessera dev ${name}\n`);
  return 0;
}
