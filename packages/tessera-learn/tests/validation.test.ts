import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProject } from '../src/plugin/validation.js';

// Create a unique temp dir for each test
let testRoot: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(tmpdir(), `tessera-validation-test-${Date.now()}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeConfig(root: string, content: string): void {
  writeFileSync(resolve(root, 'course.config.js'), content, 'utf-8');
}

function mkdirp(...parts: string[]): void {
  mkdirSync(join(...parts), { recursive: true });
}

function writeFile(root: string, relPath: string, content: string): void {
  const fullPath = resolve(root, relPath);
  mkdirSync(resolve(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

/** Create a minimal valid project structure */
function createValidProject(root: string): void {
  writeConfig(
    root,
    `export default {
  title: "Test Course",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
  );
  mkdirp(root, 'assets');
  mkdirp(root, 'pages', '01-section', '01-lesson');
  writeFile(
    root,
    'pages/01-section/_meta.js',
    'export default { title: "Section" };'
  );
  writeFile(
    root,
    'pages/01-section/01-lesson/_meta.js',
    'export default { title: "Lesson" };'
  );
  writeFile(
    root,
    'pages/01-section/01-lesson/page.svelte',
    '<h1>Hello</h1>'
  );
}

beforeEach(() => {
  testRoot = createTestDir();
});

afterEach(() => {
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    // cleanup best-effort
  }
});

// ---- Config Validation ----

describe('config validation', () => {
  it('errors when course.config.js is missing', () => {
    const { errors } = validateProject(testRoot);
    expect(errors).toContain('course.config.js not found in project root');
  });

  it('passes with valid config', () => {
    createValidProject(testRoot);
    const { errors, warnings } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
    expect(warnings).toHaveLength(0);
  });

  it('warns on unknown config fields', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
  unknownField: true,
};`
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('unknown field "unknownField"')
    );
  });

  it('errors on invalid navigation.mode', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "chaos" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"navigation.mode" must be "free" or "sequential", got "chaos"')
    );
  });

  it('errors on invalid completion.mode', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "everything" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"completion.mode" must be "quiz" or "percentage", got "everything"')
    );
  });

  it('errors on invalid export.standard', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "tin-can" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"export.standard" must be "web", "scorm12", "scorm2004", or "cmi5", got "tin-can"')
    );
  });

  it('errors on passingScore out of range (too high)', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 150 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"scoring.passingScore" must be 0–100, got 150')
    );
  });

  it('errors on passingScore out of range (negative)', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: -10 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"scoring.passingScore" must be 0–100, got -10')
    );
  });

  it('errors on percentageThreshold out of range', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 200 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"completion.percentageThreshold" must be 0–100, got 200')
    );
  });

  it('errors on unparseable config', () => {
    writeFile(testRoot, 'course.config.js', 'this is not valid JS;');
    mkdirp(testRoot, 'pages', '01-s', '01-l');
    writeFile(testRoot, 'pages/01-s/_meta.js', 'export default { title: "S" };');
    writeFile(testRoot, 'pages/01-s/01-l/_meta.js', 'export default { title: "L" };');
    writeFile(testRoot, 'pages/01-s/01-l/p.svelte', '<p>Hi</p>');

    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('could not parse')
    );
  });
});

// ---- _meta.js Validation ----

describe('_meta.js validation', () => {
  it('errors on _meta.js with syntax error', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'this is broken {'
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('_meta.js: syntax error')
    );
  });

  it('errors on _meta.js missing title', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { pages: ["page"] };'
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('_meta.js: missing required "title" field')
    );
  });

  it('errors when pages array references missing file', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "Lesson", pages: ["page", "missing-page"] };'
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pages array lists "missing-page" but missing-page.svelte not found')
    );
  });
});

// ---- pageConfig Validation ----

describe('pageConfig validation', () => {
  it('errors on non-static pageConfig (function call)', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = getConfig();
</script>
<h1>Hello</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig must be a static object literal')
    );
  });

  it('errors on non-static pageConfig (variable reference)', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
const cfg = { title: "Hello" };
export const pageConfig = cfg;
</script>
<h1>Hello</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig must be a static object literal')
    );
  });

  it('errors on pageConfig with invalid JSON5', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "ok", quiz: { graded: function() {} } };
</script>
<h1>Hello</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig must be a static object literal')
    );
  });

  it('errors on quiz.maxAttempts invalid value', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { maxAttempts: -1, graded: true } };
</script>
<h1>Quiz</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('quiz.maxAttempts must be a positive number or Infinity, got -1')
    );
  });

  it('errors on quiz.maxAttempts zero', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { maxAttempts: 0 } };
</script>
<h1>Quiz</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('quiz.maxAttempts must be a positive number or Infinity, got 0')
    );
  });

  it('accepts quiz.maxAttempts Infinity', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { maxAttempts: Infinity, graded: true } };
</script>
<h1>Quiz</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('maxAttempts'))).toHaveLength(0);
  });

  it('errors on quiz.graded not boolean', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: "yes" } };
</script>
<h1>Quiz</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('quiz.graded must be a boolean, got string')
    );
  });
});

// ---- Structure Validation ----

describe('structure validation', () => {
  it('errors on empty course (no pages dir)', () => {
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('No pages found')
    );
  });

  it('errors on empty course (empty pages dir)', () => {
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    mkdirp(testRoot, 'pages');
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('No pages found')
    );
  });

  it('warns on stray .svelte file at pages root', () => {
    createValidProject(testRoot);
    writeFile(testRoot, 'pages/stray.svelte', '<p>Stray</p>');
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('stray.svelte: this file is outside the section/lesson structure')
    );
  });

  it('treats section-level .svelte files as flat-mode pages', () => {
    createValidProject(testRoot);
    writeFile(testRoot, 'pages/01-section/flat-page.svelte', '<p>Flat page</p>');
    const { errors, warnings } = validateProject(testRoot);
    expect(errors).toEqual([]);
    expect(warnings).not.toContainEqual(
      expect.stringContaining('flat-page.svelte: this file is outside the section/lesson structure')
    );
  });

  it('warns on unlisted .svelte file in lesson', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "Lesson", pages: ["page"] };'
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/extras.svelte',
      '<h1>Extra</h1>'
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('extras.svelte: not listed in _meta.js pages array')
    );
  });
});

// ---- Asset Validation ----

describe('asset reference validation', () => {
  it('warns on unresolved $assets reference', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      '<img src="$assets/missing.png" />'
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('"$assets/missing.png" not found in assets/ directory')
    );
  });

  it('does not warn when asset exists', () => {
    createValidProject(testRoot);
    writeFile(testRoot, 'assets/logo.png', 'fake-image');
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      '<img src="$assets/logo.png" />'
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('$assets/logo.png'))
    ).toHaveLength(0);
  });
});

// ---- Cross-Cutting Validation ----

describe('cross-cutting validation', () => {
  it('errors when completion.mode is "quiz" but no graded quizzes exist', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "quiz" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('completion.mode is "quiz" but no pages have quiz config with graded: true')
    );
  });

  it('no error when completion.mode is "quiz" and graded quiz exists', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "quiz" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<h1>Quiz</h1>`
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.filter((e) => e.includes('completion.mode is "quiz"'))
    ).toHaveLength(0);
  });

  it('warns on SCORM 1.2 with high page count', () => {
    // Create a project with many pages
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "scorm12" },
};`
    );
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "Section" };'
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "Lesson" };'
    );

    // Create 1000 pages to trigger the warning
    for (let i = 0; i < 1000; i++) {
      writeFile(
        testRoot,
        `pages/01-section/01-lesson/page-${String(i).padStart(4, '0')}.svelte`,
        `<h1>Page ${i}</h1>`
      );
    }

    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('may exceed the 4096-byte limit')
    );
  });

  it('no SCORM 1.2 warning for small course', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "scorm12" },
};`
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('SCORM 1.2'))
    ).toHaveLength(0);
  });
});
