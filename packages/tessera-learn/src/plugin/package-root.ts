import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

// Walk up from this module to the tessera-learn package root (the dir holding
// its package.json). Resolving by directory depth — resolve(dirname, '..', '..')
// — is brittle: tsdown may emit plugin code at dist/plugin/ or hoist it into a
// shared chunk at dist/, and those differ by one level. The package ships src/
// and styles/, so its package.json is the stable anchor for both.
export function resolvePackageRoot(): string {
  const dir = import.meta.dirname;
  for (let up = dir; up !== dirname(up); up = dirname(up)) {
    const pkgPath = resolve(up, 'package.json');
    if (existsSync(pkgPath)) {
      try {
        const { name } = JSON.parse(readFileSync(pkgPath, 'utf-8'));
        if (name === 'tessera-learn') return up;
      } catch {
        // unreadable / non-JSON package.json — keep walking up
      }
    }
  }
  // Fallback to the historical depth assumption (dist/plugin → package root).
  return resolve(dir, '..', '..');
}
