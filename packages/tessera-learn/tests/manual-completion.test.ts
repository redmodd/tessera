import { describe, it, expect, beforeEach } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { validateProject } from '../src/plugin/validation.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig, tempDir } from './helpers.js';
import type { CourseConfig } from '../src/runtime/types.js';

function courseConfig(
  completion: string,
  navigation = 'free',
  extra = '',
): string {
  return `export default {
  title: "T",
  navigation: { mode: "${navigation}" },
  completion: { ${completion} },${extra}
  export: { standard: "web" },
};`;
}

const MANUAL_CONFIG = courseConfig('mode: "manual"');

function page(pageConfig: string): string {
  return `<script module>
  export const pageConfig = ${pageConfig};
</script>
<h1>Page</h1>`;
}

describe('manual completion — validation', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = tempDir();
  });

  function writeFile(relPath: string, content: string): void {
    const fullPath = join(testRoot, relPath);
    mkdirSync(dirname(fullPath), { recursive: true });
    writeFileSync(fullPath, content);
  }

  function createProject(
    configBody: string,
    pages: Record<string, string> = {
      'intro.svelte': '<h1>Intro</h1>',
      'outro.svelte': '<h1>Outro</h1>',
    },
    lessonMeta = 'export default { title: "L" };',
  ): void {
    writeFile('course.config.js', configBody);
    mkdirSync(join(testRoot, 'assets'));
    writeFile('pages/01-section/_meta.js', 'export default { title: "S" };');
    writeFile('pages/01-section/01-lesson/_meta.js', lessonMeta);
    for (const [name, source] of Object.entries(pages)) {
      writeFile(`pages/01-section/01-lesson/${name}`, source);
    }
  }

  function validate(...args: Parameters<typeof createProject>) {
    createProject(...args);
    return validateProject(testRoot);
  }

  it('accepts completion.mode: "manual" with no scoring block', () => {
    expect(validate(MANUAL_CONFIG).errors).toHaveLength(0);
  });

  it('rejects unknown completion.mode values', () => {
    expect(validate(courseConfig('mode: "bogus"')).errors).toContainEqual(
      expect.stringContaining(
        '"completion.mode" must be "quiz", "percentage", or "manual"',
      ),
    );
  });

  it('accepts completion.trigger: "page" with a completesOn page present', () => {
    expect(
      validate(courseConfig('mode: "manual", trigger: "page"'), {
        'intro.svelte': '<h1>Intro</h1>',
        'finale.svelte': page('{ title: "Finale", completesOn: "view" }'),
      }).errors,
    ).toHaveLength(0);
  });

  it('errors on completion.trigger: "page" when no completesOn page exists', () => {
    expect(
      validate(courseConfig('mode: "manual", trigger: "page"')).errors,
    ).toContainEqual(
      expect.stringContaining(
        'completion.mode is "manual" with trigger: "page", but no page declares pageConfig.completesOn: "view"',
      ),
    );
  });

  it('errors on invalid completion.trigger values under manual', () => {
    expect(
      validate(courseConfig('mode: "manual", trigger: "scroll"')).errors,
    ).toContainEqual(
      expect.stringContaining(
        '"completion.trigger" must be "page" or omitted, got "scroll"',
      ),
    );
  });

  it.each(['passed', 'failed'])(
    'accepts requireSuccessStatus: "%s"',
    (status) => {
      expect(
        validate(
          courseConfig(`mode: "manual", requireSuccessStatus: "${status}"`),
        ).errors,
      ).toHaveLength(0);
    },
  );

  it('rejects requireSuccessStatus: "unknown"', () => {
    expect(
      validate(courseConfig('mode: "manual", requireSuccessStatus: "unknown"'))
        .errors,
    ).toContainEqual(
      expect.stringContaining(
        '"completion.requireSuccessStatus" must be "passed" or "failed"',
      ),
    );
  });

  it('warns (not errors) when a page has quiz.graded:true under manual mode', () => {
    createProject(MANUAL_CONFIG, {
      'check.svelte': page(
        '{ quiz: { graded: true, gatesProgress: false, maxAttempts: 3 } }',
      ),
    });
    const { errors, warnings } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
    expect(warnings).toContainEqual(
      expect.stringMatching(
        /the page is graded under completion\.mode: "manual"/,
      ),
    );
  });

  it('errors when pageConfig.completesOn is not "view"', () => {
    expect(
      validate(MANUAL_CONFIG, {
        'finale.svelte': page('{ completesOn: "scroll" }'),
      }).errors,
    ).toContainEqual(
      expect.stringContaining('pageConfig.completesOn must be "view"'),
    );
  });

  it('warns when percentageThreshold is set under manual', () => {
    expect(
      validate(courseConfig('mode: "manual", percentageThreshold: 80'))
        .warnings,
    ).toContainEqual(
      expect.stringMatching(/"completion\.percentageThreshold" is ignored/),
    );
  });

  it('warns when completesOn is set under non-manual mode', () => {
    expect(
      validate(
        courseConfig(
          'mode: "percentage", percentageThreshold: 100',
          'free',
          '\n  scoring: { passingScore: 70 },',
        ),
        { 'finale.svelte': page('{ completesOn: "view" }') },
      ).warnings,
    ).toContainEqual(
      expect.stringMatching(/pageConfig\.completesOn is ignored/),
    );
  });

  it('warns when a page has both completesOn:"view" and a quiz block', () => {
    expect(
      validate(MANUAL_CONFIG, {
        'intro.svelte': '<h1>Intro</h1>',
        'finale.svelte': page(
          '{ completesOn: "view", quiz: { graded: false, maxAttempts: 1 } }',
        ),
      }).warnings,
    ).toContainEqual(
      expect.stringMatching(
        /completion fires on view, before the quiz can be answered/,
      ),
    );
  });

  it.each([
    [
      'sequential',
      {
        'intro.svelte': page('{ completesOn: "view" }'),
        'outro.svelte': '<h1>Outro</h1>',
      },
      'export default { title: "L", pages: ["intro", "outro"] };',
    ],
    [
      'free',
      { 'a.svelte': page('{ completesOn: "view" }') },
      'export default { title: "L", pages: ["a"] };',
    ],
  ])(
    'warns when first nav-ordered page has completesOn:"view" (%s)',
    (navigation, pages, lessonMeta) => {
      expect(
        validate(courseConfig('mode: "manual"', navigation), pages, lessonMeta)
          .warnings,
      ).toContainEqual(
        expect.stringMatching(
          /first page — the course will complete immediately on launch/,
        ),
      );
    },
  );
});

function manualConfig(
  overrides: Partial<CourseConfig['completion']> = {},
): CourseConfig {
  return createConfig({
    completion: { mode: 'manual', ...overrides } as CourseConfig['completion'],
    scoring: { passingScore: 0 },
  });
}

describe('manual completion — ProgressState', () => {
  it('markCompleteManually flips status once and is idempotent', () => {
    const progress = new ProgressState(createManifest(0), createConfig());
    expect(progress.completionStatus).toBe('incomplete');
    expect(progress.manuallyCompleted).toBe(false);

    progress.markCompleteManually();
    expect(progress.completionStatus).toBe('complete');
    expect(progress.manuallyCompleted).toBe(true);

    const versionAfterFirst = progress.version;
    progress.markCompleteManually();
    expect(progress.version).toBe(versionAfterFirst);
  });

  it('keeps a manual completion when percentage mode would call it incomplete', () => {
    const progress = new ProgressState(
      createManifest(4),
      createConfig({
        completion: { mode: 'percentage', percentageThreshold: 100 },
      }),
    );

    progress.markCompleteManually();
    progress.markVisited(0);
    expect(progress.completionStatus).toBe('complete');
  });

  it('stays incomplete under manual mode after every page is visited', () => {
    const progress = new ProgressState(createManifest(4), manualConfig());

    for (let i = 0; i < 4; i++) progress.markVisited(i);
    expect(progress.completionStatus).toBe('incomplete');
  });

  it('successStatus honors requireSuccessStatus only after manual mark', () => {
    const manifest = createManifest(2);
    const config = manualConfig({ requireSuccessStatus: 'passed' });
    const progress = new ProgressState(manifest, config);

    // Before marking complete: stays unknown.
    expect(progress.successStatus).toBe('unknown');

    progress.markCompleteManually();
    expect(progress.successStatus).toBe('passed');
  });

  it('successStatus stays unknown when requireSuccessStatus is omitted', () => {
    const manifest = createManifest(2);
    const config = manualConfig();
    const progress = new ProgressState(manifest, config);

    progress.markCompleteManually();
    expect(progress.successStatus).toBe('unknown');
  });
});
