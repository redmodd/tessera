import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateManifest,
  extractPageConfig,
  extractDefaultExportObjectLiteral,
  readMetaFile,
  orderPageFiles,
  stripPrefix,
  titleCase,
  deriveSlug,
} from '../src/plugin/manifest.js';

const TMP = resolve(__dirname, '__test_pages__');

function createFile(relativePath: string, content: string) {
  const fullPath = resolve(TMP, relativePath);
  const dir = resolve(fullPath, '..');
  mkdirSync(dir, { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
  return fullPath;
}

function setupStandardCourse() {
  createFile(
    '01-introduction/_meta.js',
    'export default { title: "Introduction" };',
  );
  createFile(
    '01-introduction/01-welcome/_meta.js',
    'export default { title: "Welcome", pages: ["welcome", "objectives"] };',
  );
  createFile(
    '01-introduction/01-welcome/welcome.svelte',
    `<script context="module">
export const pageConfig = { title: "Welcome to the Course" }
</script>
<h1>Welcome</h1>`,
  );
  createFile(
    '01-introduction/01-welcome/objectives.svelte',
    '<h1>Objectives</h1>',
  );
  createFile(
    '02-core-content/_meta.js',
    'export default { title: "Core Content" };',
  );
  createFile(
    '02-core-content/01-basics/_meta.js',
    'export default { title: "The Basics", pages: ["overview"] };',
  );
  createFile('02-core-content/01-basics/overview.svelte', '<h1>Overview</h1>');
}

beforeEach(() => {
  mkdirSync(TMP, { recursive: true });
});

afterEach(() => {
  rmSync(TMP, { recursive: true, force: true });
});

// ---------- Helper Tests ----------

describe('stripPrefix', () => {
  it('strips numeric prefix and hyphen', () => {
    expect(stripPrefix('01-introduction')).toBe('introduction');
    expect(stripPrefix('02-core-content')).toBe('core-content');
    expect(stripPrefix('10-advanced')).toBe('advanced');
  });

  it('returns unchanged if no prefix', () => {
    expect(stripPrefix('introduction')).toBe('introduction');
  });
});

describe('titleCase', () => {
  it('title-cases hyphenated slugs', () => {
    expect(titleCase('getting-started')).toBe('Getting Started');
    expect(titleCase('core-content')).toBe('Core Content');
  });

  it('handles single word', () => {
    expect(titleCase('welcome')).toBe('Welcome');
  });
});

describe('deriveSlug', () => {
  it('strips prefix for directories', () => {
    expect(deriveSlug('02-getting-started')).toBe('getting-started');
  });

  it('strips extension for files', () => {
    expect(deriveSlug('welcome.svelte', true)).toBe('welcome');
  });
});

describe('orderPageFiles', () => {
  it('returns listed files first, then unlisted alphabetically', () => {
    const all = ['alpha.svelte', 'beta.svelte', 'gamma.svelte'];
    const result = orderPageFiles(all, ['gamma', 'alpha']);
    expect(result).toEqual(['gamma.svelte', 'alpha.svelte', 'beta.svelte']);
  });

  it('handles .svelte extension in pages array', () => {
    const all = ['one.svelte', 'two.svelte'];
    const result = orderPageFiles(all, ['two.svelte', 'one.svelte']);
    expect(result).toEqual(['two.svelte', 'one.svelte']);
  });

  it('returns all files alphabetically when no pages array', () => {
    const all = ['c.svelte', 'a.svelte', 'b.svelte'];
    expect(orderPageFiles(all)).toEqual(['c.svelte', 'a.svelte', 'b.svelte']);
    expect(orderPageFiles(all, [])).toEqual([
      'c.svelte',
      'a.svelte',
      'b.svelte',
    ]);
  });

  it('skips listed files that do not exist', () => {
    const all = ['one.svelte', 'two.svelte'];
    const result = orderPageFiles(all, ['missing', 'one']);
    expect(result).toEqual(['one.svelte', 'two.svelte']);
  });
});

// ---------- extractDefaultExportObjectLiteral ----------

describe('extractDefaultExportObjectLiteral', () => {
  it('extracts simple object', () => {
    expect(
      extractDefaultExportObjectLiteral('export default { title: "Hello" };'),
    ).toBe('{ title: "Hello" }');
  });

  it('handles nested objects', () => {
    const literal = '{ quiz: { graded: true }, title: "T" }';
    expect(extractDefaultExportObjectLiteral(`export default ${literal}`)).toBe(
      literal,
    );
  });

  it('handles strings with braces', () => {
    const literal = '{ title: "a { b } c" }';
    expect(extractDefaultExportObjectLiteral(`export default ${literal}`)).toBe(
      literal,
    );
  });

  it('handles single-quoted strings', () => {
    const literal = "{ title: 'a { b }' }";
    expect(extractDefaultExportObjectLiteral(`export default ${literal}`)).toBe(
      literal,
    );
  });

  it('handles escaped quotes in strings', () => {
    const literal = '{ title: "a \\" b" }';
    expect(extractDefaultExportObjectLiteral(`export default ${literal}`)).toBe(
      literal,
    );
  });

  it('handles comments', () => {
    const literal = `{
  // this is a comment
  title: "Hello"
}`;
    expect(extractDefaultExportObjectLiteral(`export default ${literal}`)).toBe(
      literal,
    );
  });

  it('handles multi-line comments', () => {
    const literal = `{
  /* { nested } */
  title: "Hello"
}`;
    expect(extractDefaultExportObjectLiteral(`export default ${literal}`)).toBe(
      literal,
    );
  });

  it('returns null when there is no default export', () => {
    expect(extractDefaultExportObjectLiteral('const x = 1;')).toBeNull();
  });

  it('returns null when the default export is not an object literal', () => {
    expect(
      extractDefaultExportObjectLiteral('export default "hi";'),
    ).toBeNull();
  });

  it('returns null for unparseable source', () => {
    expect(
      extractDefaultExportObjectLiteral('export default { title: "hi"'),
    ).toBeNull();
  });
});

// ---------- readMetaFile ----------

describe('readMetaFile', () => {
  it('reads title from _meta.js', () => {
    const path = createFile(
      'meta-test/_meta.js',
      'export default { title: "My Section" };',
    );
    const meta = readMetaFile(path);
    expect(meta.title).toBe('My Section');
  });

  it('reads title and pages array', () => {
    const path = createFile(
      'meta-test2/_meta.js',
      'export default { title: "Lesson", pages: ["a", "b"] };',
    );
    const meta = readMetaFile(path);
    expect(meta.title).toBe('Lesson');
    expect(meta.pages).toEqual(['a', 'b']);
  });

  it('returns empty object for missing file', () => {
    expect(readMetaFile('/nonexistent/_meta.js')).toEqual({});
  });

  it('returns empty object for invalid content', () => {
    const path = createFile('meta-bad/_meta.js', 'not valid js');
    expect(readMetaFile(path)).toEqual({});
  });

  it('handles trailing commas', () => {
    const path = createFile(
      'meta-trailing/_meta.js',
      'export default { title: "T", pages: ["a",], };',
    );
    const meta = readMetaFile(path);
    expect(meta.title).toBe('T');
    expect(meta.pages).toEqual(['a']);
  });
});

// ---------- extractPageConfig ----------

describe('extractPageConfig', () => {
  it('extracts title from pageConfig', () => {
    const path = createFile(
      'page-test/page.svelte',
      `<script context="module">
export const pageConfig = { title: "My Page" }
</script>
<h1>Hi</h1>`,
    );
    const config = extractPageConfig(path);
    expect(config.title).toBe('My Page');
  });

  it('extracts quiz config', () => {
    const path = createFile(
      'page-quiz/quiz.svelte',
      `<script context="module">
export const pageConfig = {
  title: "Quiz",
  quiz: {
    graded: true,
    gatesProgress: true,
    maxAttempts: 3,
  }
}
</script>
<h1>Quiz</h1>`,
    );
    const config = extractPageConfig(path);
    expect(config.title).toBe('Quiz');
    expect(config.quiz).toEqual({
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
    });
  });

  it('returns empty object when no module script', () => {
    const path = createFile('page-none/page.svelte', '<h1>Hello</h1>');
    expect(extractPageConfig(path)).toEqual({});
  });

  it('returns empty object when no pageConfig export', () => {
    const path = createFile(
      'page-no-config/page.svelte',
      `<script context="module">
export const something = "else";
</script>`,
    );
    expect(extractPageConfig(path)).toEqual({});
  });

  it('handles Infinity in maxAttempts', () => {
    const path = createFile(
      'page-inf/page.svelte',
      `<script context="module">
export const pageConfig = {
  title: "Unlimited",
  quiz: { graded: true, maxAttempts: Infinity }
}
</script>`,
    );
    const config = extractPageConfig(path);
    expect(config.quiz!.maxAttempts).toBe(Infinity);
  });

  it('handles single-quoted strings', () => {
    const path = createFile(
      'page-single/page.svelte',
      `<script context="module">
export const pageConfig = { title: 'Single Quotes' }
</script>`,
    );
    const config = extractPageConfig(path);
    expect(config.title).toBe('Single Quotes');
  });
});

// ---------- generateManifest ----------

describe('generateManifest', () => {
  it('generates correct manifest for standard course structure', () => {
    setupStandardCourse();
    const manifest = generateManifest(TMP);

    expect(manifest.totalPages).toBe(3);
    expect(manifest.sections).toHaveLength(2);
    expect(manifest.pages).toHaveLength(3);

    // Section structure
    expect(manifest.sections[0].title).toBe('Introduction');
    expect(manifest.sections[0].slug).toBe('introduction');
    expect(manifest.sections[1].title).toBe('Core Content');
    expect(manifest.sections[1].slug).toBe('core-content');

    // Lesson structure
    expect(manifest.sections[0].lessons).toHaveLength(1);
    expect(manifest.sections[0].lessons[0].title).toBe('Welcome');
    expect(manifest.sections[0].lessons[0].slug).toBe('welcome');

    // Page order matches pages array
    expect(manifest.pages[0].title).toBe('Welcome to the Course');
    expect(manifest.pages[0].slug).toBe('welcome');
    expect(manifest.pages[0].index).toBe(0);

    expect(manifest.pages[1].title).toBe('Objectives');
    expect(manifest.pages[1].slug).toBe('objectives');
    expect(manifest.pages[1].index).toBe(1);

    expect(manifest.pages[2].title).toBe('Overview');
    expect(manifest.pages[2].slug).toBe('overview');
    expect(manifest.pages[2].index).toBe(2);
  });

  it('uses title-case fallback when _meta.js missing', () => {
    createFile('01-my-section/01-my-lesson/page.svelte', '<h1>Hello</h1>');
    const manifest = generateManifest(TMP);

    expect(manifest.sections[0].title).toBe('My Section');
    expect(manifest.sections[0].lessons[0].title).toBe('My Lesson');
  });

  it('uses title-case fallback for page without pageConfig', () => {
    createFile(
      '01-s/01-l/_meta.js',
      'export default { title: "L", pages: ["my-page"] };',
    );
    createFile('01-s/01-l/my-page.svelte', '<h1>Hello</h1>');
    const manifest = generateManifest(TMP);

    expect(manifest.pages[0].title).toBe('My Page');
  });

  it('appends unlisted svelte files alphabetically after listed ones', () => {
    createFile(
      '01-s/01-l/_meta.js',
      'export default { title: "L", pages: ["second"] };',
    );
    createFile('01-s/01-l/second.svelte', '<h1>Second</h1>');
    createFile('01-s/01-l/alpha.svelte', '<h1>Alpha</h1>');
    createFile('01-s/01-l/beta.svelte', '<h1>Beta</h1>');
    const manifest = generateManifest(TMP);

    expect(manifest.pages.map((p) => p.slug)).toEqual([
      'second',
      'alpha',
      'beta',
    ]);
  });

  it('handles empty pages directory', () => {
    const manifest = generateManifest(TMP);
    expect(manifest.totalPages).toBe(0);
    expect(manifest.sections).toEqual([]);
    expect(manifest.pages).toEqual([]);
  });

  it('handles nonexistent pages directory', () => {
    const manifest = generateManifest(resolve(TMP, 'nonexistent'));
    expect(manifest.totalPages).toBe(0);
  });

  it('assigns sequential indices across sections', () => {
    createFile(
      '01-a/01-l/_meta.js',
      'export default { title: "L1", pages: ["p1", "p2"] };',
    );
    createFile('01-a/01-l/p1.svelte', '<h1>P1</h1>');
    createFile('01-a/01-l/p2.svelte', '<h1>P2</h1>');
    createFile(
      '02-b/01-l/_meta.js',
      'export default { title: "L2", pages: ["p3"] };',
    );
    createFile('02-b/01-l/p3.svelte', '<h1>P3</h1>');
    const manifest = generateManifest(TMP);

    expect(manifest.pages[0].index).toBe(0);
    expect(manifest.pages[1].index).toBe(1);
    expect(manifest.pages[2].index).toBe(2);
  });

  it('flat pages array matches nested structure', () => {
    setupStandardCourse();
    const manifest = generateManifest(TMP);

    const nestedPages = manifest.sections.flatMap((s) =>
      s.lessons.flatMap((l) => l.pages),
    );
    expect(manifest.pages).toEqual(nestedPages);
  });

  it('extracts quiz config into manifest', () => {
    createFile(
      '01-s/01-l/_meta.js',
      'export default { title: "L", pages: ["quiz"] };',
    );
    createFile(
      '01-s/01-l/quiz.svelte',
      `<script context="module">
export const pageConfig = {
  title: "Assessment",
  quiz: { graded: true, gatesProgress: true, maxAttempts: 3 }
}
</script>`,
    );
    const manifest = generateManifest(TMP);

    expect(manifest.pages[0].quiz).toEqual({
      graded: true,
      gatesProgress: true,
      maxAttempts: 3,
    });
  });

  it('sets quiz to null for non-quiz pages', () => {
    createFile(
      '01-s/01-l/_meta.js',
      'export default { title: "L", pages: ["page"] };',
    );
    createFile('01-s/01-l/page.svelte', '<h1>Hello</h1>');
    const manifest = generateManifest(TMP);

    expect(manifest.pages[0].quiz).toBeNull();
  });

  it('generates correct importPath', () => {
    createFile(
      '01-intro/01-welcome/_meta.js',
      'export default { title: "W", pages: ["hello"] };',
    );
    createFile('01-intro/01-welcome/hello.svelte', '<h1>Hello</h1>');
    const manifest = generateManifest(TMP);

    expect(manifest.pages[0].importPath).toBe(
      '/pages/01-intro/01-welcome/hello.svelte',
    );
  });
});
