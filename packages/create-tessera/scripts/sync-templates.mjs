// Copy the canonical course templates from tessera-learn into create-tessera so
// the scaffolder can stamp the first course without reading another package at
// scaffold time (create-tessera runs via npx before any install). The copies are
// gitignored — tessera-learn is the single source of record; this is the sync.
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const createTesseraRoot = resolve(here, '..');
const tesseraLearnRoot = resolve(createTesseraRoot, '..', 'tessera-learn');

const TEMPLATES = ['course', 'course-bare'];

for (const name of TEMPLATES) {
  const src = resolve(tesseraLearnRoot, 'templates', name);
  const dest = resolve(createTesseraRoot, 'templates', name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
  console.log(`[sync-templates] ${name} → templates/${name}`);
}
