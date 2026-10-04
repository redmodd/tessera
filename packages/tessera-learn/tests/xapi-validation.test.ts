import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateProject } from '../src/plugin/validation.js';
import { tempDir } from './helpers.js';

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
  const root = tempDir();
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

const validate = (xapiLiteral: string, standard?: string) =>
  validateProject(projectWith(xapiLiteral, standard));

const DESTINATION = {
  id: 'lrs',
  endpoint: 'https://lrs.example.com/xapi/',
  auth: 'x',
  activityId: 'https://example.com/a',
  actor: { mbox: 'mailto:a@b.c' },
};

/** A valid explicit destination literal; an `undefined` override omits the field. */
function destination(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...DESTINATION, ...overrides });
}

describe('xapi config validation — endpoint: lms', () => {
  it('accepts xapi: { endpoint: "lms" } under cmi5', () => {
    const { errors } = validate(`{ endpoint: "lms" }`, 'cmi5');
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('accepts xapi: { endpoint: "lms" } under xapi', () => {
    const { errors } = validate(`{ endpoint: "lms" }`, 'xapi');
    expect(errors.filter((e) => e.includes("endpoint: 'lms'"))).toEqual([]);
  });

  it('warns, and does not error, on xapi.endpoint: "lms" under web export', () => {
    const { errors, warnings } = validate(`{ endpoint: "lms" }`, 'web');
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
    expect(
      warnings.find((w) => w.includes("endpoint: 'lms' has no launch LRS")),
    ).toBeDefined();
  });

  it.each(['scorm12', 'scorm2004'])(
    'warns, and does not error, on xapi.endpoint: "lms" under %s export',
    (standard) => {
      const { errors, warnings } = validate(`{ endpoint: "lms" }`, standard);
      expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
      expect(warnings.find((w) => w.includes(standard))).toBeDefined();
    },
  );

  it('warns on endpoint: "lms" when --standard overrides cmi5 to scorm12', () => {
    const testRoot = projectWith(`{ endpoint: "lms" }`, 'cmi5');
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
    const { errors } = validate(
      `{ endpoint: "lms", auth: "x", activityId: "https://example.com/a" }`,
      'cmi5',
    );
    expect(
      errors.find((e) => e.includes('auth') && e.includes("'lms'")),
    ).toBeDefined();
    expect(
      errors.find((e) => e.includes('activityId') && e.includes("'lms'")),
    ).toBeDefined();
  });
});

describe('xapi config validation — explicit endpoint', () => {
  it('accepts a fully-formed explicit destination under web', () => {
    const { errors } = validate(destination(), 'web');
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('errors when endpoint is not a URL', () => {
    const { errors } = validate(destination({ endpoint: 'not-a-url' }), 'web');
    expect(
      errors.find((e) => e.includes('endpoint') && e.includes('http')),
    ).toBeDefined();
  });

  it('errors when endpoint uses a non-http(s) scheme', () => {
    const { errors } = validate(
      destination({ endpoint: 'ftp://lrs.example.com/' }),
      'web',
    );
    expect(errors.find((e) => e.includes('endpoint'))).toBeDefined();
  });

  it('warns when endpoint has no trailing slash', () => {
    const { warnings } = validate(
      destination({ endpoint: 'https://lrs.example.com/xapi' }),
      'web',
    );
    expect(warnings.find((w) => w.includes('end with a slash'))).toBeDefined();
  });

  it('errors when auth is omitted', () => {
    const { errors } = validate(destination({ auth: undefined }), 'web');
    expect(
      errors.find((e) => e.includes('auth') && e.includes('required')),
    ).toBeDefined();
  });

  it('errors when auth string includes the "Basic " prefix', () => {
    const { errors } = validate(destination({ auth: 'Basic abc' }), 'web');
    expect(errors.find((e) => e.includes("'Basic '"))).toBeDefined();
  });

  it('errors on Bearer auth (non-goal in v1)', () => {
    const { errors } = validate(destination({ auth: 'Bearer xyz' }), 'web');
    expect(
      errors.find(
        (e) =>
          e.includes('Bearer') &&
          e.includes('not supported') &&
          e.includes('course.runtime.js'),
      ),
    ).toBeDefined();
  });

  it('warns on static-string auth (will be embedded in bundle)', () => {
    const { warnings } = validate(destination(), 'web');
    expect(warnings.find((w) => w.includes('static string'))).toBeDefined();
  });

  it('errors when activityId is missing', () => {
    const { errors } = validate(destination({ activityId: undefined }), 'web');
    expect(errors.find((e) => e.includes('activityId'))).toBeDefined();
  });

  it('errors when actor is omitted under web', () => {
    const { errors } = validate(destination({ actor: undefined }), 'web');
    expect(
      errors.find((e) => e.includes('actor is required for web')),
    ).toBeDefined();
  });

  it('accepts actor omission under cmi5 (runtime uses launch actor)', () => {
    const { errors } = validate(destination({ actor: undefined }), 'cmi5');
    expect(errors.filter((e) => e.includes('actor'))).toEqual([]);
  });

  it('accepts actor omission under scorm12 (runtime synthesizes)', () => {
    const { errors } = validate(destination({ actor: undefined }), 'scorm12');
    expect(errors.filter((e) => e.includes('actor'))).toEqual([]);
  });

  it('errors on actor with zero IFIs', () => {
    const { errors } = validate(
      destination({ actor: { name: 'anon' } }),
      'web',
    );
    expect(errors.find((e) => e.includes('Identified Agent'))).toBeDefined();
  });

  it('errors on actor with two IFIs', () => {
    const { errors } = validate(
      destination({
        actor: { mbox: 'mailto:a@b.c', openid: 'https://example.com/u' },
      }),
      'web',
    );
    expect(errors.find((e) => e.includes('exactly one IFI'))).toBeDefined();
  });

  it('errors on malformed mbox (missing mailto:)', () => {
    const { errors } = validate(
      destination({ actor: { mbox: 'test@example.com' } }),
      'web',
    );
    expect(errors.find((e) => e.includes('mailto:'))).toBeDefined();
  });

  it('errors on malformed mbox_sha1sum (not 40-char hex)', () => {
    const { errors } = validate(
      destination({ actor: { mbox_sha1sum: 'abc' } }),
      'web',
    );
    expect(errors.find((e) => e.includes('mbox_sha1sum'))).toBeDefined();
  });

  it('errors on registration that is not a UUID', () => {
    const { errors } = validate(
      destination({ registration: 'not-a-uuid' }),
      'cmi5',
    );
    expect(
      errors.find((e) => e.includes('registration') && e.includes('UUID')),
    ).toBeDefined();
  });

  it('prints a non-string registration as JSON', () => {
    const { errors } = validate(destination({ registration: 5 }), 'cmi5');
    expect(errors).toContainEqual(
      'course.config.js: xapi.registration must be a UUID v4, got 5',
    );
  });

  it('warns on registration under non-cmi5', () => {
    const { warnings } = validate(
      destination({ registration: '550e8400-e29b-41d4-a716-446655440000' }),
      'web',
    );
    expect(
      warnings.find((w) => w.includes('registration is a cmi5')),
    ).toBeDefined();
  });

  it('does not warn that registration is cmi5-only under xapi', () => {
    const { warnings } = validate(
      destination({ registration: '550e8400-e29b-41d4-a716-446655440000' }),
      'xapi',
    );
    expect(
      warnings.filter((w) => w.includes('registration is a cmi5')),
    ).toHaveLength(0);
  });

  it('withholds standard-specific warnings under an unknown standard', () => {
    const { errors, warnings } = validate(
      `[{ endpoint: "lms" }, ${destination({ registration: '550e8400-e29b-41d4-a716-446655440000' })}]`,
      'bogus',
    );
    expect(
      errors.find((e) => e.includes('"export.standard" must be "')),
    ).toBeDefined();
    expect(
      warnings.filter(
        (w) =>
          w.includes('registration is a cmi5') || w.includes('no launch LRS'),
      ),
    ).toHaveLength(0);
  });
});

describe('xapi config validation — actorAccountHomePage', () => {
  it('errors when activityId is non-http(s) under SCORM with no actor and no actorAccountHomePage', () => {
    const { errors } = validate(
      destination({ activityId: 'urn:example:course:1', actor: undefined }),
      'scorm12',
    );
    expect(
      errors.find(
        (e) =>
          e.includes('actorAccountHomePage') && e.includes("can't be used"),
      ),
    ).toBeDefined();
  });

  it('accepts non-http(s) activityId under SCORM when actorAccountHomePage is provided', () => {
    const { errors } = validate(
      destination({
        activityId: 'urn:example:course:1',
        actor: undefined,
        actorAccountHomePage: 'https://lms.example.com',
      }),
      'scorm12',
    );
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('warns when actorAccountHomePage is provided alongside an explicit actor', () => {
    const { warnings } = validate(
      destination({ actorAccountHomePage: 'https://lms.example.com' }),
      'scorm12',
    );
    expect(
      warnings.find((w) => w.includes('actorAccountHomePage is ignored when')),
    ).toBeDefined();
  });

  it('warns when actorAccountHomePage is provided under cmi5', () => {
    const { warnings } = validate(
      destination({
        actor: undefined,
        actorAccountHomePage: 'https://lms.example.com',
      }),
      'cmi5',
    );
    expect(
      warnings.find((w) => w.includes('actorAccountHomePage')),
    ).toBeDefined();
  });
});

describe('xapi config validation — array form (fan-out)', () => {
  it('accepts a multi-destination array', () => {
    const { errors } = validate(
      `[{ endpoint: "lms" }, ${destination({ endpoint: 'https://analytics.example.com/xapi/' })}]`,
      'cmi5',
    );
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('errors on empty array', () => {
    const { errors } = validate(`[]`, 'cmi5');
    expect(
      errors.find((e) => e.includes('at least one destination')),
    ).toBeDefined();
  });

  it('rejects an array actor as not an Agent object', () => {
    const { errors } = validate(destination({ actor: [] }), 'cmi5');
    expect(errors).toContainEqual(
      'course.config.js: xapi.actor must be an Agent object, got array',
    );
  });

  it('rejects an array entry as not an object', () => {
    const { errors } = validate(`[${destination()}, []]`, 'cmi5');
    expect(errors).toContainEqual(
      'course.config.js: xapi[1] must be an object',
    );
  });

  it('errors when more than one entry uses endpoint: "lms"', () => {
    const { errors } = validate(
      `[
        { endpoint: "lms" },
        { endpoint: "lms" }
      ]`,
      'cmi5',
    );
    expect(
      errors.find((e) => e.includes("multiple entries with endpoint: 'lms'")),
    ).toBeDefined();
  });

  it('warns on duplicate explicit endpoint URLs', () => {
    const { warnings } = validate(
      `[${destination()}, ${destination({ id: 'lrs2', auth: 'y', activityId: 'https://example.com/b', actor: { mbox: 'mailto:c@d.e' } })}]`,
      'web',
    );
    expect(
      warnings.find((w) => w.includes('copy-paste mistake')),
    ).toBeDefined();
  });
});

describe('xapi config — unknown-field warning', () => {
  it('does NOT warn on the xapi field (it was added to KNOWN_CONFIG_FIELDS)', () => {
    const { warnings } = validate(destination(), 'web');
    expect(
      warnings.find((w) => w.includes('unknown field "xapi"')),
    ).toBeUndefined();
  });
});

describe('xapi config validation — course.runtime.js resolvers', () => {
  const noAuth = destination({ auth: undefined, actor: undefined });
  const xapiErrors = (root: string) =>
    validateProject(root).errors.filter((e) => e.includes('xapi'));

  it('errors when an explicit destination has no id', () => {
    expect(
      xapiErrors(projectWith(destination({ id: undefined }))).find((e) =>
        e.includes('xapi.id is required'),
      ),
    ).toBeDefined();
  });

  it('errors on duplicate destination ids', () => {
    const testRoot = projectWith(
      `[${destination()}, ${destination({ endpoint: 'https://lrs2.example.com/xapi/' })}]`,
    );
    expect(
      xapiErrors(testRoot).find((e) =>
        e.includes('more than one destination with id "lrs"'),
      ),
    ).toBeDefined();
  });

  it('accepts auth and actor resolvers exported for the destination id', () => {
    const testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { auth: () => fetch('/token').then((r) => r.text()), actor() { return { mbox: 'mailto:a@b.c' }; } } };`,
    );
    const { errors, warnings } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
    expect(warnings.find((w) => w.includes('static string'))).toBeUndefined();
  });

  it('errors when auth is in neither file', () => {
    const testRoot = projectWith(noAuth);
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
    const testRoot = projectWith(destination());
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
    const testRoot = projectWith(destination());
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lsr: { auth: () => 'y' } };`,
    );
    expect(xapiErrors(testRoot)).toEqual([
      'course.runtime.js: xapi["lsr"] matches no explicit xapi destination id in course.config.js',
    ]);
  });

  it('does not report resolver keys as unmatched when the destination endpoint is missing', () => {
    const testRoot = projectWith(destination({ endpoint: undefined }));
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { auth: () => 'y' } };`,
    );
    expect(xapiErrors(testRoot)).toEqual([
      'course.config.js: xapi.endpoint is required',
    ]);
  });

  it('errors on resolver keys when course.config.js declares no destinations', () => {
    const testRoot = projectWith('null');
    writeFile(
      testRoot,
      'course.runtime.js',
      `export const xapi = { lrs: { auth: () => 'y' } };`,
    );
    expect(
      xapiErrors(testRoot).find((e) => e.includes('xapi["lrs"] matches no')),
    ).toBeDefined();
  });

  it.each([
    [
      'the export is not a literal',
      `import { makeHooks } from './hooks.js';\nexport const xapi = makeHooks();`,
    ],
    [
      'xapi is exported through a specifier',
      `const hooks = { lrs: { auth: async () => 'x' } };\nexport { hooks as xapi };`,
    ],
    [
      'xapi is bound by destructuring',
      `import * as mod from './hooks.js';\nexport const { xapi } = mod;`,
    ],
    [
      'the object is mutated after declaration',
      `export const xapi = { lrs: {} };\nObject.assign(xapi.lrs, { auth: () => 'y' });`,
    ],
    [
      'the object is mutated through an alias',
      `export const xapi = {};\nconst hooks = xapi;\nhooks.lrs = { auth: () => 'y' };`,
    ],
    [
      'a destination entry is mutated through an alias',
      `export const xapi = { lrs: {} };\nconst lrs = xapi.lrs;\nlrs.auth = () => 'y';`,
    ],
    [
      'the object is mutated through a namespace import',
      `import * as self from './course.runtime.js';\nexport const xapi = {};\nself.xapi.lrs = { auth: () => 'y' };`,
    ],
    [
      'a namespace import is aliased',
      `import * as self from './course.runtime.js';\nexport const xapi = {};\nconst mod = self;\nmod.xapi.lrs = { auth: () => 'y' };`,
    ],
    [
      'a namespace import is read by computed key',
      `import * as self from './course.runtime.js';\nexport const xapi = {};\nself['xapi'].lrs = { auth: () => 'y' };`,
    ],
    [
      'a destination entry is not a literal',
      `const lrs = { auth: () => 'y' };\nexport const xapi = { lrs };`,
    ],
  ])('skips the pairing checks when %s', (_, source) => {
    const testRoot = projectWith(noAuth);
    writeFile(testRoot, 'course.runtime.js', source);
    expect(xapiErrors(testRoot)).toEqual([]);
  });

  it('still checks resolver pairing beside a destructured export that does not bind xapi', () => {
    const testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `import * as mod from './hooks.js';\nexport const { canAccess, xapi: other } = mod;`,
    );
    expect(
      xapiErrors(testRoot).find((e) => e.includes('xapi.auth is required')),
    ).toBeDefined();
  });

  it('still checks resolver pairing beside a namespace import read by name', () => {
    const testRoot = projectWith(noAuth);
    writeFile(
      testRoot,
      'course.runtime.js',
      `import * as tokens from './tokens.js';\nexport const xapi = { lrs: { actor: tokens.actor } };`,
    );
    expect(
      xapiErrors(testRoot).find((e) => e.includes('xapi.auth is required')),
    ).toBeDefined();
  });

  it('errors on a default export in course.runtime.js', () => {
    const testRoot = projectWith(destination());
    writeFile(
      testRoot,
      'course.runtime.js',
      `export default { canAccess: () => true };`,
    );
    expect(
      validateProject(testRoot).errors.find((e) =>
        e.startsWith('course.runtime.js: export default is ignored'),
      ),
    ).toBeDefined();
  });

  it('lets a resolved actor satisfy the SCORM account homePage rule', () => {
    const testRoot = projectWith(
      destination({ activityId: 'urn:example:course:1', actor: undefined }),
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
    const testRoot = projectWith(destination());
    writeFile(testRoot, 'course.runtime.js', 'export const xapi = {');
    expect(validateProject(testRoot).errors).toContain(
      'course.runtime.js: could not parse, JavaScript syntax error',
    );
  });

  it('names function values in course.config.js and points at course.runtime.js', () => {
    const { errors } = validate(
      `[{ id: "lrs", endpoint: "https://lrs.example.com/xapi/", auth: () => "x", activityId: "https://example.com/a", actor: function () { return {}; } }]`,
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('"xapi[0].auth" is a function');
    expect(errors[0]).toContain('course.runtime.js');
    expect(errors[1]).toContain('"xapi[0].actor" is a function');
  });
});
