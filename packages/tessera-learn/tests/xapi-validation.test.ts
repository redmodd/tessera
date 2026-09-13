import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProject } from '../src/plugin/validation.js';

let testRoot: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(
    tmpdir(),
    `tessera-xapi-validation-${Date.now()}-${counter}`,
  );
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(root: string, relPath: string, content: string): void {
  const fullPath = resolve(root, relPath);
  mkdirSync(resolve(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

/**
 * Build a minimal valid project with the given xapi config inlined into
 * `course.config.js`. Configs use JSON5 syntax; function values belong in course.runtime.js.
 */
function projectWith(xapiLiteral: string, standard = 'web'): string {
  const root = createTestDir();
  writeFile(
    root,
    'course.config.js',
    `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "${standard}" },
  xapi: ${xapiLiteral},
};`,
  );
  mkdirSync(resolve(root, 'assets'), { recursive: true });
  writeFile(
    root,
    'pages/01-section/_meta.js',
    'export default { title: "S" };',
  );
  writeFile(
    root,
    'pages/01-section/01-lesson/_meta.js',
    'export default { title: "L" };',
  );
  writeFile(root, 'pages/01-section/01-lesson/page.svelte', '<h1>Hi</h1>');
  return root;
}

beforeEach(() => {
  testRoot = '';
});

afterEach(() => {
  if (testRoot) {
    try {
      rmSync(testRoot, { recursive: true, force: true });
    } catch {}
  }
});

describe('xapi config validation — endpoint: lms', () => {
  it('accepts xapi: { endpoint: "lms" } under cmi5', () => {
    testRoot = projectWith(`{ endpoint: "lms" }`, 'cmi5');
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('accepts xapi: { endpoint: "lms" } under xapi', () => {
    testRoot = projectWith(`{ endpoint: "lms" }`, 'xapi');
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes("endpoint: 'lms'"))).toEqual([]);
  });

  it('warns, and does not error, on xapi.endpoint: "lms" under web export', () => {
    testRoot = projectWith(`{ endpoint: "lms" }`, 'web');
    const { errors, warnings } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
    expect(
      warnings.find((w) => w.includes("endpoint: 'lms' has no launch LRS")),
    ).toBeDefined();
  });

  it.each(['scorm12', 'scorm2004'])(
    'warns, and does not error, on xapi.endpoint: "lms" under %s export',
    (standard) => {
      testRoot = projectWith(`{ endpoint: "lms" }`, standard);
      const { errors, warnings } = validateProject(testRoot);
      expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
      expect(warnings.find((w) => w.includes(standard))).toBeDefined();
    },
  );

  it('warns on endpoint: "lms" when --standard overrides cmi5 to scorm12', () => {
    testRoot = projectWith(`{ endpoint: "lms" }`, 'cmi5');
    expect(
      validateProject(testRoot).warnings.filter((w) => w.includes('xapi')),
    ).toEqual([]);
    const { errors, warnings } = validateProject(testRoot, 'scorm12');
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
    expect(
      warnings.find((w) => w.includes("endpoint: 'lms' has no launch LRS")),
    ).toBeDefined();
  });

  it('errors when extra fields appear alongside endpoint: "lms"', () => {
    testRoot = projectWith(
      `{ endpoint: "lms", auth: "x", activityId: "https://example.com/a" }`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('auth') && e.includes("'lms'")),
    ).toBeDefined();
    expect(
      errors.find((e) => e.includes('activityId') && e.includes("'lms'")),
    ).toBeDefined();
  });
});

describe('xapi config validation — explicit endpoint', () => {
  function explicit(extra = ''): string {
    return `{
      id: "lrs",
      endpoint: "https://lrs.example.com/xapi/",
      auth: "tok",
      activityId: "https://example.com/course/1",
      actor: { mbox: "mailto:test@example.com" }${extra ? ',' + extra : ''}
    }`;
  }

  it('accepts a fully-formed explicit destination under web', () => {
    testRoot = projectWith(explicit(), 'web');
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('errors when endpoint is not a URL', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "not-a-url", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('endpoint') && e.includes('http')),
    ).toBeDefined();
  });

  it('errors when endpoint uses a non-http(s) scheme', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "ftp://lrs.example.com/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('endpoint'))).toBeDefined();
  });

  it('warns when endpoint has no trailing slash', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.find((w) => w.includes('end with a slash'))).toBeDefined();
  });

  it('errors when auth is omitted', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('auth') && e.includes('required')),
    ).toBeDefined();
  });

  it('errors when auth string includes the "Basic " prefix', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "Basic abc", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes("'Basic '"))).toBeDefined();
  });

  it('errors on Bearer auth (non-goal in v1)', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "Bearer xyz", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('Bearer') && e.includes('not supported')),
    ).toBeDefined();
  });

  it('warns on static-string auth (will be embedded in bundle)', () => {
    testRoot = projectWith(explicit(), 'web');
    const { warnings } = validateProject(testRoot);
    expect(warnings.find((w) => w.includes('static string'))).toBeDefined();
  });

  it('errors when activityId is missing', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('activityId'))).toBeDefined();
  });

  it('errors when actor is omitted under web', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a" }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('actor is required for web')),
    ).toBeDefined();
  });

  it('accepts actor omission under cmi5 (runtime uses launch actor)', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a" }`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('actor'))).toEqual([]);
  });

  it('accepts actor omission under scorm12 (runtime synthesizes)', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a" }`,
      'scorm12',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('actor'))).toEqual([]);
  });

  it('errors on actor with zero IFIs', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { name: "anon" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('Identified Agent'))).toBeDefined();
  });

  it('errors on actor with two IFIs', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c", openid: "https://example.com/u" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('exactly one IFI'))).toBeDefined();
  });

  it('errors on malformed mbox (missing mailto:)', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "test@example.com" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('mailto:'))).toBeDefined();
  });

  it('errors on malformed mbox_sha1sum (not 40-char hex)', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox_sha1sum: "abc" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('mbox_sha1sum'))).toBeDefined();
  });

  it('errors on registration that is not a UUID', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, registration: "not-a-uuid" }`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('registration') && e.includes('UUID')),
    ).toBeDefined();
  });

  it('warns on registration under non-cmi5', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, registration: "550e8400-e29b-41d4-a716-446655440000" }`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('registration is a cmi5')),
    ).toBeDefined();
  });

  it('does not warn that registration is cmi5-only under xapi', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, registration: "550e8400-e29b-41d4-a716-446655440000" }`,
      'xapi',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('registration is a cmi5')),
    ).toHaveLength(0);
  });
});

describe('xapi config validation — actorAccountHomePage', () => {
  it('errors when activityId is non-http(s) under SCORM with no actor and no actorAccountHomePage', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "urn:example:course:1" }`,
      'scorm12',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find(
        (e) =>
          e.includes('actorAccountHomePage') && e.includes("can't be used"),
      ),
    ).toBeDefined();
  });

  it('accepts non-http(s) activityId under SCORM when actorAccountHomePage is provided', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "urn:example:course:1", actorAccountHomePage: "https://lms.example.com" }`,
      'scorm12',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('warns when actorAccountHomePage is provided alongside an explicit actor', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, actorAccountHomePage: "https://lms.example.com" }`,
      'scorm12',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('actorAccountHomePage is ignored when')),
    ).toBeDefined();
  });

  it('warns when actorAccountHomePage is provided under cmi5', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actorAccountHomePage: "https://lms.example.com" }`,
      'cmi5',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('actorAccountHomePage')),
    ).toBeDefined();
  });
});

describe('xapi config validation — array form (fan-out)', () => {
  it('accepts a multi-destination array', () => {
    testRoot = projectWith(
      `[
        { endpoint: "lms" },
        { id: "lrs", endpoint: "https://analytics.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }
      ]`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('errors on empty array', () => {
    testRoot = projectWith(`[]`, 'cmi5');
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('at least one destination')),
    ).toBeDefined();
  });

  it('errors when more than one entry uses endpoint: "lms"', () => {
    testRoot = projectWith(
      `[
        { endpoint: "lms" },
        { endpoint: "lms" }
      ]`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes("multiple entries with endpoint: 'lms'")),
    ).toBeDefined();
  });

  it('warns on duplicate explicit endpoint URLs', () => {
    testRoot = projectWith(
      `[
        { id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } },
        { id: "lrs2", endpoint: "https://lrs.example.com/xapi/", auth: "y", activityId: "https://example.com/b", actor: { mbox: "mailto:c@d.e" } }
      ]`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('copy-paste mistake')),
    ).toBeDefined();
  });
});

describe('xapi config — unknown-field warning', () => {
  it('does NOT warn on the xapi field (it was added to KNOWN_CONFIG_FIELDS)', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('unknown field "xapi"')),
    ).toBeUndefined();
  });
});

describe('xapi config validation — course.runtime.js resolvers', () => {
  const noAuth = `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", activityId: "https://example.com/a" }`;
  const full = `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`;
  const xapiErrors = (root: string) =>
    validateProject(root).errors.filter((e) => e.includes('xapi'));

  it('errors when an explicit destination has no id', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
    );
    expect(
      xapiErrors(testRoot).find((e) => e.includes('xapi.id is required')),
    ).toBeDefined();
  });

  it('errors on duplicate destination ids', () => {
    testRoot = projectWith(
      `[${full}, ${full.replace('lrs.example', 'lrs2.example')}]`,
    );
    expect(
      xapiErrors(testRoot).find((e) =>
        e.includes('more than one destination with id "lrs"'),
      ),
    ).toBeDefined();
  });

  it('accepts auth and actor resolvers exported for the destination id', () => {
    testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { auth: () => fetch('/token').then((r) => r.text()), actor() { return { mbox: 'mailto:a@b.c' }; } } };`,
    );
    const { errors, warnings } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
    expect(warnings.find((w) => w.includes('static string'))).toBeUndefined();
  });

  it('reads resolvers through local bindings and an export specifier', () => {
    testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `const auth = async () => 'x';
const lrs = { auth, actor: async () => ({ mbox: 'mailto:a@b.c' }) };
const hooks = { lrs };
export { hooks as xapi };`,
    );
    expect(xapiErrors(testRoot)).toEqual([]);
  });

  it('errors when auth is in neither file', () => {
    testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { actor: () => ({ mbox: 'mailto:a@b.c' }) } };`,
    );
    expect(
      xapiErrors(testRoot).find(
        (e) =>
          e.includes('xapi.auth is required') && e.includes('xapi["lrs"].auth'),
      ),
    ).toBeDefined();
  });

  it('errors when auth is set in both files', () => {
    testRoot = projectWith(full);
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { auth: () => 'y' } };`,
    );
    expect(
      xapiErrors(testRoot).find((e) =>
        e.includes('xapi.auth is also resolved'),
      ),
    ).toBeDefined();
  });

  it('errors when a resolver key matches no destination id', () => {
    testRoot = projectWith(full);
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lsr: { auth: () => 'y' } };`,
    );
    expect(xapiErrors(testRoot)).toEqual([
      'course.runtime.js: xapi["lsr"] matches no explicit xapi destination id in course.config.js',
    ]);
  });

  it('errors on resolver keys when course.config.js declares no destinations', () => {
    testRoot = projectWith('null');
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { auth: () => 'y' } };`,
    );
    expect(
      xapiErrors(testRoot).find((e) => e.includes('xapi["lrs"] matches no')),
    ).toBeDefined();
  });

  it('skips the pairing checks when the xapi export is not a literal', () => {
    testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `import { makeHooks } from './hooks.js';\nexport const xapi = makeHooks();`,
    );
    expect(xapiErrors(testRoot)).toEqual([]);
  });

  it('lets a resolved actor satisfy the SCORM account homePage rule', () => {
    testRoot = projectWith(
      `{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "urn:example:course:1" }`,
      'scorm12',
    );
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { actor: () => ({ mbox: 'mailto:a@b.c' }) } };`,
    );
    expect(xapiErrors(testRoot)).toEqual([]);
  });

  it('errors when course.runtime.js does not parse', () => {
    testRoot = projectWith(full);
    writeFile(testRoot, 'course.runtime.js', 'export const xapi = {');
    expect(validateProject(testRoot).errors).toContain(
      'course.runtime.js: could not parse, JavaScript syntax error',
    );
  });

  it('names function values in course.config.js and points at course.runtime.js', () => {
    testRoot = projectWith(
      `[{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: () => "x", activityId: "https://example.com/a", actor: function () { return {}; } }]`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('"xapi[0].auth" is a function');
    expect(errors[0]).toContain('course.runtime.js');
    expect(errors[1]).toContain('"xapi[0].actor" is a function');
  });
});
