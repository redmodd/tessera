import { describe, it, expect, beforeEach, onTestFinished, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProject } from '../src/plugin/validation.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { NavigationState } from '../src/runtime/navigation.svelte.js';
import { useCompletion } from '../src/runtime/hooks.svelte.js';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import { SCORM2004Adapter } from '../src/runtime/adapters/scorm2004.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import {
  createManifest,
  createConfig,
  flush,
  scorm12Api,
  scorm2004Api,
} from './helpers.js';
import type { BaseAdapter } from '../src/runtime/adapters/base.js';
import type {
  CompletionStatus,
  SavedState,
  SuccessStatus,
} from '../src/runtime/persistence.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type { ManifestPage } from '../src/plugin/manifest.js';

// ============================================================================
// 1. Validation
// ============================================================================

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

function page(pageConfig: string, heading = 'Page'): string {
  return `<script module>
  export const pageConfig = ${pageConfig};
</script>
<h1>${heading}</h1>`;
}

describe('manual completion — validation', () => {
  let testRoot: string;

  beforeEach(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'tessera-manual-'));
    onTestFinished(() => rmSync(testRoot, { recursive: true, force: true }));
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

  const errorsFor = (...args: Parameters<typeof createProject>) => {
    createProject(...args);
    return validateProject(testRoot).errors;
  };

  const warningsFor = (...args: Parameters<typeof createProject>) => {
    createProject(...args);
    return validateProject(testRoot).warnings;
  };

  it('accepts completion.mode: "manual" with no scoring block', () => {
    expect(errorsFor(MANUAL_CONFIG)).toHaveLength(0);
  });

  it('rejects unknown completion.mode values', () => {
    expect(errorsFor(courseConfig('mode: "bogus"'))).toContainEqual(
      expect.stringContaining(
        '"completion.mode" must be "quiz", "percentage", or "manual"',
      ),
    );
  });

  it('accepts completion.trigger: "page" with a completesOn page present', () => {
    expect(
      errorsFor(courseConfig('mode: "manual", trigger: "page"'), {
        'intro.svelte': '<h1>Intro</h1>',
        'finale.svelte': page('{ title: "Finale", completesOn: "view" }'),
      }),
    ).toHaveLength(0);
  });

  it('errors on completion.trigger: "page" when no completesOn page exists', () => {
    expect(
      errorsFor(courseConfig('mode: "manual", trigger: "page"')),
    ).toContainEqual(
      expect.stringContaining(
        'completion.mode is "manual" with trigger: "page", but no page declares pageConfig.completesOn: "view"',
      ),
    );
  });

  it('errors on invalid completion.trigger values under manual', () => {
    expect(
      errorsFor(courseConfig('mode: "manual", trigger: "scroll"')),
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
        errorsFor(
          courseConfig(`mode: "manual", requireSuccessStatus: "${status}"`),
        ),
      ).toHaveLength(0);
    },
  );

  it('rejects requireSuccessStatus: "unknown"', () => {
    expect(
      errorsFor(
        courseConfig('mode: "manual", requireSuccessStatus: "unknown"'),
      ),
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
      errorsFor(MANUAL_CONFIG, {
        'finale.svelte': page('{ completesOn: "scroll" }'),
      }),
    ).toContainEqual(
      expect.stringContaining('pageConfig.completesOn must be "view"'),
    );
  });

  it('warns when percentageThreshold is set under manual', () => {
    expect(
      warningsFor(courseConfig('mode: "manual", percentageThreshold: 80')),
    ).toContainEqual(
      expect.stringMatching(/"completion\.percentageThreshold" is ignored/),
    );
  });

  it('warns when completesOn is set under non-manual mode', () => {
    expect(
      warningsFor(
        courseConfig(
          'mode: "percentage", percentageThreshold: 100',
          'free',
          '\n  scoring: { passingScore: 70 },',
        ),
        { 'finale.svelte': page('{ completesOn: "view" }') },
      ),
    ).toContainEqual(
      expect.stringMatching(/pageConfig\.completesOn is ignored/),
    );
  });

  it('warns when a page has both completesOn:"view" and a quiz block', () => {
    expect(
      warningsFor(MANUAL_CONFIG, {
        'intro.svelte': '<h1>Intro</h1>',
        'finale.svelte': page(
          '{ completesOn: "view", quiz: { graded: false, maxAttempts: 1 } }',
        ),
      }),
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
        warningsFor(
          courseConfig('mode: "manual"', navigation),
          pages,
          lessonMeta,
        ),
      ).toContainEqual(
        expect.stringMatching(
          /first page — the course will complete immediately on launch/,
        ),
      );
    },
  );
});

// ============================================================================
// 2. Progress state
// ============================================================================

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

  it('manuallyCompleted getter reflects internal latch', () => {
    const progress = new ProgressState(createManifest(0), createConfig());
    expect(progress.manuallyCompleted).toBe(false);
    progress.markCompleteManually();
    expect(progress.manuallyCompleted).toBe(true);
  });
});

// ============================================================================
// 3. Hook
// ============================================================================

const ctxStore = new Map<string, unknown>();

vi.mock('svelte', async () => {
  const actual = await vi.importActual<typeof import('svelte')>('svelte');
  return {
    ...actual,
    getContext: (name: string) => ctxStore.get(name),
  };
});

function makeNavCtx(progress: ProgressState, config: CourseConfig) {
  const manifest = createManifest(3);
  const nav = new NavigationState(manifest, progress, config);
  return { nav, manifest, progress, config };
}

describe('manual completion — useCompletion hook', () => {
  beforeEach(() => {
    ctxStore.clear();
  });

  it('markComplete flips progress and reflects completionStatus', () => {
    const progress = new ProgressState(createManifest(0), createConfig());
    const config = manualConfig();
    ctxStore.set('tessera-nav', makeNavCtx(progress, config));

    const handle = useCompletion();
    expect(handle.completionStatus).toBe('incomplete');

    handle.markComplete();
    expect(progress.completionStatus).toBe('complete');
    expect(handle.completionStatus).toBe('complete');
  });

  it('markComplete is a no-op outside manual mode and warns once per session', async () => {
    vi.resetModules();
    const { useCompletion } = await import('../src/runtime/hooks.svelte.js');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const progress = new ProgressState(createManifest(0), createConfig());
    // percentage mode (the helper default)
    const config = createConfig();
    ctxStore.set('tessera-nav', makeNavCtx(progress, config));

    const handle = useCompletion();
    handle.markComplete();
    handle.markComplete();
    handle.markComplete();

    expect(progress.completionStatus).toBe('incomplete');
    // dev mode is true under vitest (import.meta.env.DEV)
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('throws when called outside a Tessera course', () => {
    expect(() => useCompletion()).toThrow(
      /must be called inside a Tessera course/,
    );
  });

  it('flips successStatus when requireSuccessStatus is set', () => {
    const config = manualConfig({ requireSuccessStatus: 'passed' });
    const progress = new ProgressState(createManifest(0), config);
    ctxStore.set('tessera-nav', makeNavCtx(progress, config));

    const handle = useCompletion();
    handle.markComplete();
    expect(progress.successStatus).toBe('passed');
  });
});

// ============================================================================
// 4. Adapter integration (the contract — what App.svelte will call on the
//    adapter when manual completion fires). We exercise the real adapters
//    directly to verify per-standard behavior.
// ============================================================================

describe('manual completion — adapter integration', () => {
  it('SCORM 1.2 writes lesson_status = completed when only completion is set', async () => {
    const api = scorm12Api();
    const adapter = new SCORM12Adapter(api);
    await adapter.init();

    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('unknown');
    adapter.commit();
    await flush();

    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.lesson_status',
      'completed',
    );
  });

  it('SCORM 1.2 writes lesson_status = passed when requireSuccessStatus = "passed"', async () => {
    const api = scorm12Api();
    const adapter = new SCORM12Adapter(api);
    await adapter.init();

    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');
    adapter.commit();
    await flush();

    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.lesson_status',
      'passed',
    );
  });

  it('SCORM 2004 writes completion_status + success_status independently', async () => {
    const api = scorm2004Api();
    const adapter = new SCORM2004Adapter(api);
    await adapter.init();

    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('unknown');
    adapter.commit();
    await flush();

    expect(api.SetValue).toHaveBeenCalledWith(
      'cmi.completion_status',
      'completed',
    );
    expect(api.SetValue).toHaveBeenCalledWith('cmi.success_status', 'unknown');
  });

  it('SCORM 2004 writes success_status = "passed" when requireSuccessStatus is "passed"', async () => {
    const api = scorm2004Api();
    const adapter = new SCORM2004Adapter(api);
    await adapter.init();

    adapter.setCompletionStatus('complete');
    adapter.setSuccessStatus('passed');
    adapter.commit();
    await flush();

    expect(api.SetValue).toHaveBeenCalledWith(
      'cmi.completion_status',
      'completed',
    );
    expect(api.SetValue).toHaveBeenCalledWith('cmi.success_status', 'passed');
  });

  it('web adapter no-ops on setCompletionStatus (state goes into localStorage via saveState)', async () => {
    // jsdom-free environment — verify the call doesn't throw and is a pure
    // in-memory bookkeeping.
    const adapter = new WebAdapter(createConfig());
    await adapter.init();
    expect(() => adapter.setCompletionStatus('complete')).not.toThrow();
    expect(() => adapter.setSuccessStatus('passed')).not.toThrow();
    expect(() => adapter.commit()).not.toThrow();
  });
});

// ============================================================================
// 5. Persistence — m: 1 round-trip
// ============================================================================

describe('manual completion — persistence', () => {
  it('serializes m: 1 only when manuallyCompleted is true', () => {
    const progress = new ProgressState(createManifest(0), createConfig());
    // Mirror App.svelte#serializeState's m-key logic in isolation.
    function serialize(): Pick<SavedState, 'b' | 'v' | 'q' | 'd' | 'm'> {
      return {
        b: 0,
        v: [],
        q: {},
        d: 0,
        ...(progress.manuallyCompleted ? { m: 1 as const } : {}),
      };
    }

    expect(serialize().m).toBeUndefined();
    progress.markCompleteManually();
    expect(serialize().m).toBe(1);
  });

  it('restoring m: 1 reapplies the latch and survives recalculation', () => {
    const manifest = createManifest(4);
    const config = manualConfig();
    const progress = new ProgressState(manifest, config);

    // Restore-side equivalent: progress.markCompleteManually() when saved.m === 1
    const saved: SavedState = { b: 0, v: [], q: {}, d: 0, m: 1 };
    if (saved.m === 1) progress.markCompleteManually();

    expect(progress.completionStatus).toBe('complete');
    expect(progress.manuallyCompleted).toBe(true);
  });

  it('restored m: 1 holds even if completion.mode changed between sessions', () => {
    const manifest = createManifest(4);
    // Pretend the course was redeployed under percentage mode.
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
    });
    const progress = new ProgressState(manifest, config);

    progress.markCompleteManually();
    // No pages visited — percentage would otherwise be incomplete.
    expect(progress.completionStatus).toBe('complete');
  });
});

// ============================================================================
// 6. Page-trigger (mirrors App.svelte's loadPage logic)
// ============================================================================

function pageWithCompletesOn(index: number): ManifestPage {
  return {
    index,
    title: `Page ${index}`,
    slug: `page-${index}`,
    importPath: `/pages/page-${index}.svelte`,
    quiz: null,
    completesOn: 'view',
  };
}

describe('manual completion — page trigger', () => {
  /**
   * Mirror of the relevant branch in App.svelte#loadPage: if a page has
   * `completesOn: "view"` AND the course is in manual mode, the page-load
   * effect marks completion and recomputes success.
   */
  function loadPage(
    index: number,
    pages: ManifestPage[],
    progress: ProgressState,
    config: CourseConfig,
  ) {
    progress.markVisited(index);
    if (
      pages[index].completesOn === 'view' &&
      config.completion.mode === 'manual'
    ) {
      progress.markCompleteManually();
    }
  }

  it('marks completion on first visit to a completesOn:"view" page', () => {
    const pages = [
      { ...pageWithCompletesOn(0), completesOn: undefined } as ManifestPage,
      pageWithCompletesOn(1),
    ];
    const progress = new ProgressState(createManifest(0), createConfig());
    const config = manualConfig();

    loadPage(0, pages, progress, config);
    expect(progress.completionStatus).toBe('incomplete');

    loadPage(1, pages, progress, config);
    expect(progress.completionStatus).toBe('complete');
  });

  it('revisiting a completesOn page is idempotent', () => {
    const pages = [pageWithCompletesOn(0)];
    const progress = new ProgressState(createManifest(0), createConfig());
    const config = manualConfig();

    loadPage(0, pages, progress, config);
    const versionAfterFirst = progress.version;

    loadPage(0, pages, progress, config);
    // visited is idempotent and manual mark is idempotent — version
    // should not advance.
    expect(progress.version).toBe(versionAfterFirst);
  });

  it('completesOn page does not fire under non-manual modes', () => {
    const pages = [pageWithCompletesOn(0)];
    const progress = new ProgressState(createManifest(0), createConfig());
    // percentage mode — completesOn is ignored at runtime
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
    });

    loadPage(0, pages, progress, config);
    expect(progress.manuallyCompleted).toBe(false);
  });
});

// ============================================================================
// 7. Live-session success push (mirrors App.svelte's prevSuccessStatus effect)
// ============================================================================

describe('manual completion — live success-status push', () => {
  /**
   * Mirror of App.svelte's status-push effects: completion and success each
   * commit on change. The effect re-runs whenever its tracked reads change;
   * the test invokes it manually after each progress mutation.
   */
  function makeStatusPusher(
    progress: ProgressState,
    adapter: Pick<
      BaseAdapter,
      'setCompletionStatus' | 'setSuccessStatus' | 'commit'
    >,
  ) {
    let prevCompletion: CompletionStatus = progress.completionStatus;
    let prevSuccess: SuccessStatus = progress.successStatus;
    return () => {
      if (progress.completionStatus !== prevCompletion) {
        prevCompletion = progress.completionStatus;
        adapter.setCompletionStatus(prevCompletion);
        adapter.commit();
      }
      if (progress.successStatus !== prevSuccess) {
        prevSuccess = progress.successStatus;
        adapter.setSuccessStatus(prevSuccess);
        adapter.commit();
      }
    };
  }

  it('pushes setSuccessStatus("passed") to the adapter when markComplete fires under requireSuccessStatus', () => {
    const manifest = createManifest(2);
    const config = manualConfig({ requireSuccessStatus: 'passed' });
    const progress = new ProgressState(manifest, config);
    const adapter = {
      setCompletionStatus: vi.fn(),
      setSuccessStatus: vi.fn(),
      commit: vi.fn(),
    };

    const flush = makeStatusPusher(progress, adapter);

    progress.markCompleteManually();
    flush();

    expect(adapter.setCompletionStatus).toHaveBeenCalledWith('complete');
    expect(adapter.setSuccessStatus).toHaveBeenCalledWith('passed');
    expect(adapter.commit).toHaveBeenCalled();
  });

  it('does not push success on markComplete when requireSuccessStatus is omitted', () => {
    const manifest = createManifest(2);
    const config = manualConfig();
    const progress = new ProgressState(manifest, config);
    const adapter = {
      setCompletionStatus: vi.fn(),
      setSuccessStatus: vi.fn(),
      commit: vi.fn(),
    };

    const flush = makeStatusPusher(progress, adapter);

    progress.markCompleteManually();
    flush();

    expect(adapter.setCompletionStatus).toHaveBeenCalledWith('complete');
    // successStatus stayed 'unknown' — no transition, no push.
    expect(adapter.setSuccessStatus).not.toHaveBeenCalled();
  });

  it('pushes setSuccessStatus("failed") under requireSuccessStatus: "failed"', () => {
    const manifest = createManifest(2);
    const config = manualConfig({ requireSuccessStatus: 'failed' });
    const progress = new ProgressState(manifest, config);
    const adapter = {
      setCompletionStatus: vi.fn(),
      setSuccessStatus: vi.fn(),
      commit: vi.fn(),
    };

    const flush = makeStatusPusher(progress, adapter);

    progress.markCompleteManually();
    flush();

    expect(adapter.setSuccessStatus).toHaveBeenCalledWith('failed');
  });
});
