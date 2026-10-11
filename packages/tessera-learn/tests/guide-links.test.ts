import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const PKG_ROOT = resolve(import.meta.dirname, '..');
const GUIDE_FILES = [
  'AGENTS.md',
  ...readdirSync(resolve(PKG_ROOT, 'docs'))
    .filter((file) => file.endsWith('.md'))
    .map((file) => `docs/${file}`),
];

function prose(file: string): string {
  return readFileSync(file, 'utf-8').replace(/^```[\s\S]*?^```/gm, '');
}

function anchors(file: string): Set<string> {
  return new Set(
    Array.from(prose(file).matchAll(/^#{1,6} (.+)$/gm), ([, heading]) =>
      heading
        .toLowerCase()
        .replace(/[^\w\- ]/g, '')
        .replaceAll(' ', '-'),
    ),
  );
}

describe('authoring guide links', () => {
  it.each(GUIDE_FILES)('%s links to files and headings that exist', (file) => {
    const path = resolve(PKG_ROOT, file);
    const broken: string[] = [];
    for (const [, target, anchor] of prose(path).matchAll(
      /\]\((?!https?:)([^)#]*)(?:#([^)]+))?\)/g,
    )) {
      const targetPath = target ? resolve(dirname(path), target) : path;
      if (!existsSync(targetPath)) broken.push(target);
      else if (anchor && !anchors(targetPath).has(anchor))
        broken.push(`${target}#${anchor}`);
    }
    expect(broken).toEqual([]);
  });

  it('routes to every reference file from AGENTS.md', () => {
    const core = readFileSync(resolve(PKG_ROOT, 'AGENTS.md'), 'utf-8');
    for (const file of GUIDE_FILES.slice(1)) expect(core).toContain(file);
  });
});
