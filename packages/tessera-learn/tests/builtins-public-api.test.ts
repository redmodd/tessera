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
  /(?:import|export)\s+(?!type\s)([^'";]+?)\s+from\s+['"](\.\.\/[^'"]+)['"]|import\s+['"](\.\.\/[^'"]+)['"]/g;

describe('built-in components', () => {
  it('import only public API from outside src/components/', () => {
    const violations: string[] = [];
    for (const file of readdirSync(componentsDir)) {
      const source = readFileSync(componentsDir + file, 'utf8');
      for (const [, clause, from, sideEffect] of source.matchAll(IMPORT_RE)) {
        if (sideEffect) {
          violations.push(`${file}: side-effect import ${sideEffect}`);
          continue;
        }
        const braces = clause.match(/\{([^}]*)\}/);
        const outside = clause.replace(/\{[^}]*\}/, '').replace(/[\s,]/g, '');
        if (outside) violations.push(`${file}: ${outside} from ${from}`);
        if (!braces) continue;
        const names = braces[1]
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
