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
 * `course.config.js`. Configs use JSON5 syntax — function-form auth/actor
 * are out of scope for build-time validation (deferred to runtime).
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

  it('errors on xapi.endpoint: "lms" under web export', () => {
    testRoot = projectWith(`{ endpoint: "lms" }`, 'web');
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes("'lms' requires export.standard: 'cmi5'")),
    ).toBeDefined();
  });

  it('errors on xapi.endpoint: "lms" under scorm12 export', () => {
    testRoot = projectWith(`{ endpoint: "lms" }`, 'scorm12');
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('scorm12'))).toBeDefined();
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
      `{ endpoint: "not-a-url", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('endpoint') && e.includes('http')),
    ).toBeDefined();
  });

  it('errors when endpoint uses a non-http(s) scheme', () => {
    testRoot = projectWith(
      `{ endpoint: "ftp://lrs.example.com/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('endpoint'))).toBeDefined();
  });

  it('warns when endpoint has no trailing slash', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.find((w) => w.includes('end with a slash'))).toBeDefined();
  });

  it('errors when auth is omitted', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('auth') && e.includes('required')),
    ).toBeDefined();
  });

  it('errors when auth string includes the "Basic " prefix', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "Basic abc", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes("'Basic '"))).toBeDefined();
  });

  it('errors on Bearer auth (non-goal in v1)', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "Bearer xyz", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
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
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('activityId'))).toBeDefined();
  });

  it('errors when actor is omitted under web', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a" }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('actor is required for web')),
    ).toBeDefined();
  });

  it('accepts actor omission under cmi5 (runtime uses launch actor)', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a" }`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('actor'))).toEqual([]);
  });

  it('accepts actor omission under scorm12 (runtime synthesizes)', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a" }`,
      'scorm12',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('actor'))).toEqual([]);
  });

  it('errors on actor with zero IFIs', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { name: "anon" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('Identified Agent'))).toBeDefined();
  });

  it('errors on actor with two IFIs', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c", openid: "https://example.com/u" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('exactly one IFI'))).toBeDefined();
  });

  it('errors on malformed mbox (missing mailto:)', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "test@example.com" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('mailto:'))).toBeDefined();
  });

  it('errors on malformed mbox_sha1sum (not 40-char hex)', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox_sha1sum: "abc" } }`,
      'web',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.find((e) => e.includes('mbox_sha1sum'))).toBeDefined();
  });

  it('errors on registration that is not a UUID', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, registration: "not-a-uuid" }`,
      'cmi5',
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.find((e) => e.includes('registration') && e.includes('UUID')),
    ).toBeDefined();
  });

  it('warns on registration under non-cmi5', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, registration: "550e8400-e29b-41d4-a716-446655440000" }`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('registration is a cmi5')),
    ).toBeDefined();
  });
});

describe('xapi config validation — actorAccountHomePage', () => {
  it('errors when activityId is non-http(s) under SCORM with no actor and no actorAccountHomePage', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "urn:example:course:1" }`,
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
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "urn:example:course:1", actorAccountHomePage: "https://lms.example.com" }`,
      'scorm12',
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('xapi'))).toEqual([]);
  });

  it('warns when actorAccountHomePage is provided alongside an explicit actor', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" }, actorAccountHomePage: "https://lms.example.com" }`,
      'scorm12',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('actorAccountHomePage is ignored when')),
    ).toBeDefined();
  });

  it('warns when actorAccountHomePage is provided under cmi5', () => {
    testRoot = projectWith(
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actorAccountHomePage: "https://lms.example.com" }`,
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
        { endpoint: "https://analytics.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }
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
        { endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } },
        { endpoint: "https://lrs.example.com/xapi/", auth: "y", activityId: "https://example.com/b", actor: { mbox: "mailto:c@d.e" } }
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
      `{ endpoint: "https://lrs.example.com/xapi/", auth: "x", activityId: "https://example.com/a", actor: { mbox: "mailto:a@b.c" } }`,
      'web',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.find((w) => w.includes('unknown field "xapi"')),
    ).toBeUndefined();
  });
});
