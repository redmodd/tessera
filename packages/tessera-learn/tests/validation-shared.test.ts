import { describe, it, expect } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProject } from '../src/plugin/validation.js';
import { tempDir } from './helpers.js';

function makeCourse(): string {
  const root = tempDir();
  const lesson = join(root, 'pages', '01-section', '01-lesson');
  mkdirSync(lesson, { recursive: true });
  mkdirSync(join(root, 'assets'), { recursive: true });
  writeFileSync(
    join(root, 'course.config.js'),
    `export default {
  title: "Shared Import",
  language: "en",
  navigation: { mode: "free" },
  completion: { mode: "percentage", percentageThreshold: 100 },
  scoring: { passingScore: 70 },
  export: { standard: "web" },
};`,
  );
  writeFileSync(
    join(root, 'pages', '01-section', '_meta.js'),
    'export default { title: "Section" };',
  );
  writeFileSync(
    join(lesson, '_meta.js'),
    'export default { title: "Lesson" };',
  );
  return root;
}

describe('validation with $shared imports', () => {
  it('does not flag a page that imports from $shared', () => {
    const course = makeCourse();
    writeFileSync(
      join(course, 'pages', '01-section', '01-lesson', 'page.svelte'),
      `<script>
  import Button from '$shared/Button.svelte';
  import '$shared/tokens.css';
</script>

<h1>Hello</h1>
<Button>Click</Button>`,
    );

    const { errors } = validateProject(course);
    expect(errors).toEqual([]);
    // No error should mention the unresolved workspace alias.
    const joined = JSON.stringify(errors);
    expect(joined).not.toContain('$shared');
  });
});
