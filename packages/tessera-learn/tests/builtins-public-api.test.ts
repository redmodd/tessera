import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as publicApi from '../src/index.js';

// Built-in components must be buildable by an author: anything they pull from
// outside src/components/ has to be part of the public `tessera-learn` API.
const componentsDir = fileURLToPath(
  new URL('../src/components/', import.meta.url),
);
const IMPORT_RE =
  /import\s+(\{[^}]*\}|\*\s+as\s+[\w$]+|[\w$]+)\s+from\s+['"](\.\.\/[^'"]+)['"]/g;

describe('built-in components', () => {
  it('import only public API from outside src/components/', () => {
    const violations: string[] = [];
    for (const file of readdirSync(componentsDir)) {
      const source = readFileSync(componentsDir + file, 'utf8');
      for (const [, binding, from] of source.matchAll(IMPORT_RE)) {
        if (!binding.startsWith('{')) {
          violations.push(`${file}: ${binding} from ${from}`);
          continue;
        }
        const names = binding
          .slice(1, -1)
          .split(',')
          .map((n) => n.trim().split(/\s+as\s+/)[0])
          .filter(Boolean);
        for (const name of names) {
          if (!(name in publicApi))
            violations.push(`${file}: ${name} from ${from}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
