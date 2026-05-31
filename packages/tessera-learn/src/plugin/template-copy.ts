import {
  copyFileSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

// npm's tarball packing strips/renames leading-dot files, so templates store
// them prefixed and we restore the dot on copy. (create-vite convention.)
const RENAME: Record<string, string> = {
  _gitignore: '.gitignore',
  _gitkeep: '.gitkeep',
};

// Text files get token substitution; everything else is copied byte-for-byte.
const TEXT = /\.(svelte|js|ts|json|css|md|html)$/;

function applyTokens(s: string, tokens: Record<string, string>): string {
  return s.replace(/__([A-Z_]+)__/g, (m, key) =>
    key in tokens ? tokens[key] : m,
  );
}

export function copyTemplate(
  srcDir: string,
  destDir: string,
  tokens: Record<string, string>,
): void {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
    const src = join(srcDir, entry.name);
    const dest = join(destDir, RENAME[entry.name] ?? entry.name);
    if (entry.isDirectory()) {
      copyTemplate(src, dest, tokens);
    } else if (TEXT.test(entry.name)) {
      writeFileSync(dest, applyTokens(readFileSync(src, 'utf-8'), tokens));
    } else {
      copyFileSync(src, dest);
    }
  }
}
