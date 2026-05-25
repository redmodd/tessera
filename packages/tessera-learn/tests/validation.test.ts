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
  const dir = resolve(
    tmpdir(),
    `tessera-validation-test-${Date.now()}-${counter}`,
  );
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
  language: "en",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
  );
  mkdirp(root, 'assets');
  mkdirp(root, 'pages', '01-section', '01-lesson');
  writeFile(
    root,
    'pages/01-section/_meta.js',
    'export default { title: "Section" };',
  );
  writeFile(
    root,
    'pages/01-section/01-lesson/_meta.js',
    'export default { title: "Lesson" };',
  );
  writeFile(root, 'pages/01-section/01-lesson/page.svelte', '<h1>Hello</h1>');
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
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('unknown field "unknownField"'),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"navigation.mode" must be "free" or "sequential", got "chaos"',
      ),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"completion.mode" must be "quiz", "percentage", or "manual", got "everything"',
      ),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"export.standard" must be "web", "scorm12", "scorm2004", or "cmi5", got "tin-can"',
      ),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"scoring.passingScore" must be 0–100, got 150'),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"scoring.passingScore" must be 0–100, got -10'),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"completion.percentageThreshold" must be 0–100, got 200',
      ),
    );
  });

  it('warns when title is missing', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('"title" is missing or empty'),
    );
  });

  it('warns when title is an empty string', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('"title" is missing or empty'),
    );
  });

  it('warns that a whitespace-only title ships verbatim, not as the default', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "   ",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('"title" is only whitespace'),
    );
    expect(warnings).not.toContainEqual(
      expect.stringContaining('"title" is missing or empty'),
    );
  });

  it('errors when title is not a string', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: 123,
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('"title" must be a string, got number'),
    );
  });

  it('warns when branding.logo uses the $assets alias', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  branding: { logo: "$assets/logo.png" },
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('"branding.logo" starts with "$assets/"'),
    );
  });

  it('warns on an unparseable branding.primaryColor', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  branding: { primaryColor: "not a color" },
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        '"branding.primaryColor" "not a color" does not look like a valid CSS color',
      ),
    );
  });

  it('accepts a valid branding.primaryColor', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  branding: { primaryColor: "#3366ff", fontFamily: "Inter, sans-serif" },
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.filter((w) => w.includes('branding'))).toHaveLength(0);
  });

  it('accepts a modern CSS color function for branding.primaryColor', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  branding: { primaryColor: "oklch(0.7 0.15 200)" },
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.filter((w) => w.includes('branding'))).toHaveLength(0);
  });

  it('warns when branding is an array', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  branding: ["#fff"],
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('"branding" must be an object, got array'),
    );
  });

  it('warns when branding.fontFamily is not a string', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  branding: { fontFamily: 42 },
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        '"branding.fontFamily" must be a string, got number',
      ),
    );
  });

  it('errors on unparseable config', () => {
    writeFile(testRoot, 'course.config.js', 'this is not valid JS;');
    mkdirp(testRoot, 'pages', '01-s', '01-l');
    writeFile(
      testRoot,
      'pages/01-s/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-s/01-l/_meta.js',
      'export default { title: "L" };',
    );
    writeFile(testRoot, 'pages/01-s/01-l/p.svelte', '<p>Hi</p>');

    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(expect.stringContaining('could not parse'));
  });
});

// ---- _meta.js Validation ----

describe('_meta.js validation', () => {
  it('errors on _meta.js with syntax error', () => {
    createValidProject(testRoot);
    writeFile(testRoot, 'pages/01-section/_meta.js', 'this is broken {');
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('_meta.js: syntax error'),
    );
  });

  it('errors on _meta.js missing title', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { pages: ["page"] };',
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('_meta.js: missing required "title" field'),
    );
  });

  it('errors when pages array references missing file', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "Lesson", pages: ["page", "missing-page"] };',
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'pages array lists "missing-page" but missing-page.svelte not found',
      ),
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
<h1>Hello</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig must be a static object literal'),
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
<h1>Hello</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig must be a static object literal'),
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
<h1>Hello</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig must be a static object literal'),
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
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'quiz.maxAttempts must be a positive number or Infinity, got -1',
      ),
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
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'quiz.maxAttempts must be a positive number or Infinity, got 0',
      ),
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
<h1>Quiz</h1>`,
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
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('quiz.graded must be a boolean, got string'),
    );
  });

  it('errors on quiz.gatesProgress not boolean', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { gatesProgress: "yes" } };
</script>
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'quiz.gatesProgress must be a boolean, got string',
      ),
    );
  });

  it('errors on invalid quiz.feedbackMode', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { feedbackMode: "imediate" } };
</script>
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'quiz.feedbackMode must be "review", "immediate", or "never", got "imediate"',
      ),
    );
  });

  it('errors on invalid quiz.retryMode', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { retryMode: "partial" } };
</script>
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'quiz.retryMode must be "full" or "incorrect-only", got "partial"',
      ),
    );
  });

  it('accepts valid quiz.feedbackMode and retryMode', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { feedbackMode: "immediate", retryMode: "incorrect-only" } };
</script>
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.filter(
        (e) => e.includes('feedbackMode') || e.includes('retryMode'),
      ),
    ).toHaveLength(0);
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(expect.stringContaining('No pages found'));
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
};`,
    );
    mkdirp(testRoot, 'pages');
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(expect.stringContaining('No pages found'));
  });

  it('warns on stray .svelte file at pages root', () => {
    createValidProject(testRoot);
    writeFile(testRoot, 'pages/stray.svelte', '<p>Stray</p>');
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'stray.svelte: this file is outside the section/lesson structure',
      ),
    );
  });

  it('treats section-level .svelte files as flat-mode pages', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/flat-page.svelte',
      '<p>Flat page</p>',
    );
    const { errors, warnings } = validateProject(testRoot);
    expect(errors).toEqual([]);
    expect(warnings).not.toContainEqual(
      expect.stringContaining(
        'flat-page.svelte: this file is outside the section/lesson structure',
      ),
    );
  });

  it('warns when a section contributes no pages', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/02-empty/_meta.js',
      'export default { title: "Empty" };',
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        '02-empty: section contributed no pages and will be empty',
      ),
    );
  });

  it('warns on unlisted .svelte file in lesson', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "Lesson", pages: ["page"] };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/extras.svelte',
      '<h1>Extra</h1>',
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'extras.svelte: not listed in _meta.js pages array',
      ),
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
      '<img src="$assets/missing.png" />',
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        '"$assets/missing.png" not found in assets/ directory',
      ),
    );
  });

  it('does not warn when asset exists', () => {
    createValidProject(testRoot);
    writeFile(testRoot, 'assets/logo.png', 'fake-image');
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      '<img src="$assets/logo.png" />',
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.filter((w) => w.includes('$assets/logo.png'))).toHaveLength(
      0,
    );
  });
});

// ---- Question Component Validation ----

describe('question component validation', () => {
  function writePage(content: string): void {
    writeFile(testRoot, 'pages/01-section/01-lesson/page.svelte', content);
  }

  it('errors when MultipleChoice is missing a required prop', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Pick one" options={["a", "b"]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '<MultipleChoice> is missing required prop "correct"',
      ),
    );
  });

  it('errors when MultipleChoice correct index is out of range', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b", "c"]} correct={5} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('correct={5} is out of range for 3 options'),
    );
  });

  it('accepts a well-formed MultipleChoice', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b", "c"]} correct={2} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('MultipleChoice'))).toHaveLength(0);
  });

  it('skips static checks when props are dynamic expressions', () => {
    createValidProject(testRoot);
    writePage(
      `<script>
  import { MultipleChoice } from 'tessera-learn';
  let opts = ["a", "b"];
  let answer = 9;
</script>
<MultipleChoice question="Q" options={opts} correct={answer} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('MultipleChoice'))).toHaveLength(0);
  });

  it('errors when Sorting correct and items arrays differ in length', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { Sorting } from 'tessera-learn';</script>
<Sorting question="Q" items={["x", "y", "z"]} targets={["A", "B"]} correct={[0, 1]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('correct has 2 entries but items has 3'),
    );
  });

  it('errors when Sorting correct contains an out-of-range target index', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { Sorting } from 'tessera-learn';</script>
<Sorting question="Q" items={["x", "y"]} targets={["A", "B"]} correct={[0, 4]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('correct contains 4, out of range for 2 targets'),
    );
  });

  it('errors on duplicate question ids on the same page', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice id="q1" question="A" options={["a", "b"]} correct={0} />
<MultipleChoice id="q1" question="B" options={["a", "b"]} correct={1} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('duplicate question id "q1"'),
    );
  });

  it('errors when Matching is missing pairs', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { Matching } from 'tessera-learn';</script>
<Matching question="Match them" />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('<Matching> is missing required prop "pairs"'),
    );
  });

  it('errors when Matching pairs entries are malformed', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { Matching } from 'tessera-learn';</script>
<Matching question="Q" pairs={[{ left: "France" }]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '<Matching> pairs must be an array of { left: string, right: string }',
      ),
    );
  });

  it('accepts well-formed Matching pairs', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { Matching } from 'tessera-learn';</script>
<Matching question="Q" pairs={[{ left: "France", right: "Paris" }]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors.filter((e) => e.includes('Matching'))).toHaveLength(0);
  });

  it('errors when FillInTheBlank answers contains a non-string', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { FillInTheBlank } from 'tessera-learn';</script>
<FillInTheBlank question="Q" answers={["Oxygen", 8]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '<FillInTheBlank> answers must be an array of strings',
      ),
    );
  });

  it('errors when FillInTheBlank answers is empty', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { FillInTheBlank } from 'tessera-learn';</script>
<FillInTheBlank question="Q" answers={[]} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('<FillInTheBlank> answers must not be empty'),
    );
  });

  it('warns when a question weight is a string', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b"]} correct={0} weight="2" />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'weight="2" is a string and is ignored (treated as 1)',
      ),
    );
  });

  it('errors when a question weight is non-finite', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b"]} correct={0} weight={Infinity} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('weight must be finite'),
    );
  });

  it('warns when a question weight is not positive', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b"]} correct={0} weight={0} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('weight 0 is not positive and is ignored'),
    );
  });

  it('accepts a positive numeric weight', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b"]} correct={0} weight={2} />`,
    );
    const { errors, warnings } = validateProject(testRoot);
    expect(
      [...errors, ...warnings].filter((m) => m.includes('weight')),
    ).toHaveLength(0);
  });

  it('warns when MultipleChoice optionFeedback has more entries than options', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b"]} correct={0} optionFeedback={["x", "y", "z"]} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'optionFeedback has 3 entries but only 2 options',
      ),
    );
  });

  it('does not warn when optionFeedback is shorter than options', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b", "c"]} correct={0} optionFeedback={["x"]} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.filter((w) => w.includes('optionFeedback'))).toHaveLength(
      0,
    );
  });

  it('warns when a question id will be rewritten under SCORM 1.2', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "scorm12" },
};`,
    );
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice id="my question" question="Q" options={["a", "b"]} correct={0} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'question id "my question" will be rewritten to "my_question" for SCORM 1.2',
      ),
    );
  });

  it('errors on a SCORM 1.2 sanitized id collision', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "scorm12" },
};`,
    );
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice id="q-1" question="A" options={["a", "b"]} correct={0} />
<MultipleChoice id="q_1" question="B" options={["a", "b"]} correct={1} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'collides with a prior id after SCORM 1.2 sanitization ("q_1")',
      ),
    );
  });

  it('does not flag id rewrites under non-scorm12 export', () => {
    createValidProject(testRoot);
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice id="my question" question="Q" options={["a", "b"]} correct={0} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('will be rewritten')),
    ).toHaveLength(0);
  });

  it('does not double-report a raw duplicate as a SCORM 1.2 collision', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "percentage" },
  scoring: { passingScore: 70 },
  export: { standard: "scorm12" },
};`,
    );
    writePage(
      `<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice id="q1" question="A" options={["a", "b"]} correct={0} />
<MultipleChoice id="q1" question="B" options={["a", "b"]} correct={1} />`,
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.filter((e) => e.includes('duplicate question id')),
    ).toHaveLength(1);
    expect(
      errors.filter((e) => e.includes('after SCORM 1.2 sanitization')),
    ).toHaveLength(0);
  });
});

// ---- Contract Bypass Detection ----

describe('contract bypass detection', () => {
  function writePage(content: string): void {
    writeFile(testRoot, 'pages/01-section/01-lesson/page.svelte', content);
  }

  it('errors when a page dispatches tessera-quiz-complete directly', () => {
    createValidProject(testRoot);
    writePage(
      `<script>
  function fakeSubmit(el) {
    el.dispatchEvent(new CustomEvent('tessera-quiz-complete', { detail: {} }));
  }
</script>
<h1>Page</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('dispatches "tessera-quiz-complete" directly'),
    );
  });

  it('errors when a page imports from tessera-learn/runtime/*', () => {
    createValidProject(testRoot);
    writePage(
      `<script>
  import { something } from 'tessera-learn/runtime/hooks.svelte.js';
</script>
<h1>Page</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('imports from tessera-learn/runtime/*'),
    );
  });

  it('errors on contract bypass in root quiz.svelte', () => {
    createValidProject(testRoot);
    writeFile(
      testRoot,
      'quiz.svelte',
      `<script>
  import { internal } from 'tessera-learn/runtime/hooks.svelte.js';
</script>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'quiz.svelte: imports from tessera-learn/runtime/*',
      ),
    );
  });

  it('warns on a quiz page with no questions', () => {
    createValidProject(testRoot);
    writePage(
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<h1>Empty quiz</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'quiz page has no question components or useQuestion() calls',
      ),
    );
  });

  it('does not warn when a quiz page has a question component', () => {
    createValidProject(testRoot);
    writePage(
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<script>import { MultipleChoice } from 'tessera-learn';</script>
<MultipleChoice question="Q" options={["a", "b"]} correct={0} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('quiz page has no question')),
    ).toHaveLength(0);
  });

  it('does not warn when a quiz page uses useQuestion directly', () => {
    createValidProject(testRoot);
    writePage(
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<script>
  import { useQuestion } from 'tessera-learn';
  const q = useQuestion({ id: 'q1', response: () => ({ type: 'other', response: [] }) });
</script>
<h1>Custom question</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('quiz page has no question')),
    ).toHaveLength(0);
  });

  it('does not warn when a quiz page imports a custom .svelte widget', () => {
    createValidProject(testRoot);
    writePage(
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<script>
  import CustomRound from '../components/CustomRound.svelte';
</script>
{#each [1, 2, 3] as i}<CustomRound {i} />{/each}`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('quiz page has no question')),
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
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'completion.mode is "quiz" but no pages have quiz config with graded: true',
      ),
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
};`,
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<h1>Quiz</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(
      errors.filter((e) => e.includes('completion.mode is "quiz"')),
    ).toHaveLength(0);
  });

  it('warns when completion.mode is "quiz" but passingScore is unset', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "quiz" },
  export: { standard: "web" },
};`,
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<h1>Quiz</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining(
        'scoring.passingScore is not set — defaulting to 70%',
      ),
    );
  });

  it('does not nudge when passingScore is set explicitly under quiz mode', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "Test",
  navigation: { mode: "free" },
  completion: { mode: "quiz" },
  scoring: { passingScore: 80 },
  export: { standard: "web" },
};`,
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/page.svelte',
      `<script context="module">
export const pageConfig = { title: "Quiz", quiz: { graded: true } };
</script>
<h1>Quiz</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.filter((w) => w.includes('passingScore is not set')),
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
};`,
    );
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "Section" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "Lesson" };',
    );

    // Create 1000 pages to trigger the warning
    for (let i = 0; i < 1000; i++) {
      writeFile(
        testRoot,
        `pages/01-section/01-lesson/page-${String(i).padStart(4, '0')}.svelte`,
        `<h1>Page ${i}</h1>`,
      );
    }

    const { warnings } = validateProject(testRoot);
    expect(warnings).toContainEqual(
      expect.stringContaining('may exceed the 4096-byte limit'),
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
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(warnings.filter((w) => w.includes('SCORM 1.2'))).toHaveLength(0);
  });
});

// ---- Accessibility (a11y) Validation ----

/** Overwrite the single page created by createValidProject. */
function writePage(root: string, content: string): void {
  writeFile(root, 'pages/01-section/01-lesson/page.svelte', content);
}

const has = (arr: string[], substr: string): boolean =>
  arr.some((s) => s.includes(substr));

describe('a11y rule 1.3 — Image alt-or-decorative', () => {
  it('errors when <Image> has no alt and is not decorative', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(true);
  });

  it('passes when alt is present', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" alt="A diagram" />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(false);
  });

  it('passes when marked decorative', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" decorative={true} />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(false);
  });

  it('errors on empty alt with no decorative', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" alt="" />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(true);
  });

  it('warns when decorative but alt text is also supplied', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" decorative alt="X" />`);
    const { errors, warnings } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(false);
    expect(has(warnings, 'tessera/image-alt')).toBe(true);
  });

  it('skips a non-static alt expression (no false positive)', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" alt={someVar} />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(false);
  });
});

describe('a11y rule 1.4 — media title / captions / transcript', () => {
  it('errors when <Video> has no title', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Video src="https://youtu.be/abcdefghijk" />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/media-title')).toBe(true);
  });

  it('errors when <Audio> has no title', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Audio src="$assets/a.mp3" transcript="…" />`);
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/media-title')).toBe(true);
  });

  it('warns when a YouTube embed has no transcript', () => {
    createValidProject(testRoot);
    writePage(
      testRoot,
      `<Video src="https://www.youtube.com/watch?v=abcdefghijk" title="T" />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/media-transcript')).toBe(true);
  });

  it('warns when a native video has neither tracks nor transcript', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Video src="$assets/clip.mp4" title="T" />`);
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/media-captions')).toBe(true);
  });

  it('does not warn on a native video that has tracks', () => {
    createValidProject(testRoot);
    writePage(
      testRoot,
      `<Video src="$assets/clip.mp4" title="T" tracks={[{ src: '$assets/c.vtt', kind: 'captions' }]} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/media-captions')).toBe(false);
  });

  it('warns when <Audio> has no transcript', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Audio src="$assets/a.mp3" title="T" />`);
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/media-transcript')).toBe(true);
  });
});

describe('a11y rule 1.5 — question option/answer labels', () => {
  it('warns on an empty option label', () => {
    createValidProject(testRoot);
    writePage(
      testRoot,
      `<MultipleChoice question="Q" options={['A', '']} correct={0} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/question-label')).toBe(true);
  });

  it('does not warn when all options are non-empty', () => {
    createValidProject(testRoot);
    writePage(
      testRoot,
      `<MultipleChoice question="Q" options={['A', 'B']} correct={0} />`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/question-label')).toBe(false);
  });
});

describe('a11y rule 1.6 — heading order', () => {
  it('warns on a skipped heading level', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<h1>Title</h1>\n<h3>Sub</h3>`);
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/heading-order')).toBe(true);
  });

  it('does not warn on a well-ordered hierarchy', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<h1>Title</h1>\n<h2>Sub</h2>\n<h3>Sub-sub</h3>`);
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/heading-order')).toBe(false);
  });
});

describe('a11y rule 1.7 — primaryColor contrast', () => {
  it('warns on a low-contrast primaryColor against white', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  language: "en",
  branding: { primaryColor: "#93c5fd" },
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/primary-contrast')).toBe(true);
  });

  it('does not warn on a passing primaryColor', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  language: "en",
  branding: { primaryColor: "#2563eb" },
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/primary-contrast')).toBe(false);
  });
});

describe('a11y rule 1.8 — language tag', () => {
  it('warns when language is missing', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/lang')).toBe(true);
  });

  it('warns on an implausible BCP-47 tag', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  language: "english",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/lang')).toBe(true);
  });

  it('accepts a well-formed tag', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  language: "fr-CA",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(has(warnings, 'tessera/lang')).toBe(false);
  });
});

describe('a11y config block — level and ignore', () => {
  it('errors on an invalid a11y.level', () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  language: "en",
  a11y: { level: "loud" },
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'a11y.level')).toBe(true);
  });

  it('ignore suppresses a hard contract error by rule ID', () => {
    createValidProject(testRoot);
    writePage(testRoot, `<Image src="$assets/x.png" />`);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  language: "en",
  a11y: { ignore: ["tessera/image-alt"] },
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(has(errors, 'tessera/image-alt')).toBe(false);
  });

  it("level: 'error' promotes a promotable warning to an error", () => {
    createValidProject(testRoot);
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  a11y: { level: "error" },
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
    );
    const { errors, warnings } = validateProject(testRoot);
    expect(has(errors, 'tessera/lang')).toBe(true);
    expect(has(warnings, 'tessera/lang')).toBe(false);
  });
});
