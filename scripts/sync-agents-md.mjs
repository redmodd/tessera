#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'AGENTS.md');
const targets = [
  resolve(root, 'packages/tessera/AGENTS.md'),
  resolve(root, 'packages/create-tessera/AGENTS.md'),
];

const content = readFileSync(source, 'utf8');
const checkOnly = process.argv.includes('--check');

let drift = false;
for (const target of targets) {
  if (checkOnly) {
    let current = '';
    try { current = readFileSync(target, 'utf8'); } catch {}
    if (current !== content) {
      console.error(`AGENTS.md drift: ${target}`);
      drift = true;
    }
  } else {
    writeFileSync(target, content);
    console.log(`wrote ${target}`);
  }
}

if (drift) {
  console.error('Run `pnpm sync:agents` to refresh.');
  process.exit(1);
}
