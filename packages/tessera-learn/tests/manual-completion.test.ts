import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { validateProject } from '../src/plugin/validation.js';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig, gradedQuizIndices } from './helpers.js';
import type { CourseConfig } from '../src/runtime/types.js';
import type { ManifestPage } from '../src/plugin/manifest.js';

// ============================================================================
// 1. Validation
// ============================================================================

let testRoot: string;
let counter = 0;

function createTestDir(): string {
  counter++;
  const dir = resolve(tmpdir(), `tessera-manual-${Date.now()}-${counter}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeFile(root: string, relPath: string, content: string): void {
  const fullPath = resolve(root, relPath);
  mkdirSync(resolve(fullPath, '..'), { recursive: true });
  writeFileSync(fullPath, content, 'utf-8');
}

function writeConfig(root: string, content: string): void {
  writeFileSync(resolve(root, 'course.config.js'), content, 'utf-8');
}

function mkdirp(...parts: string[]): void {
  mkdirSync(join(...parts), { recursive: true });
}

/** Project with no completesOn pages. */
function createBareProject(root: string, configBody: string): void {
  writeConfig(root, configBody);
  mkdirp(root, 'assets');
  mkdirp(root, 'pages', '01-section', '01-lesson');
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
  writeFile(root, 'pages/01-section/01-lesson/intro.svelte', '<h1>Intro</h1>');
  writeFile(root, 'pages/01-section/01-lesson/outro.svelte', '<h1>Outro</h1>');
}

/** Project where the second page declares completesOn: "view". */
function createProjectWithCompletesOn(root: string, configBody: string): void {
  writeConfig(root, configBody);
  mkdirp(root, 'assets');
  mkdirp(root, 'pages', '01-section', '01-lesson');
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
  writeFile(root, 'pages/01-section/01-lesson/intro.svelte', '<h1>Intro</h1>');
  writeFile(
    root,
    'pages/01-section/01-lesson/finale.svelte',
    `<script module>
  export const pageConfig = { title: "Finale", completesOn: "view" };
</script>
<h1>Finale</h1>`,
  );
}

beforeEach(() => {
  testRoot = createTestDir();
});

afterEach(() => {
  try {
    rmSync(testRoot, { recursive: true, force: true });
  } catch {
    // best-effort cleanup
  }
});

const MANUAL_CONFIG = `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual" },
  export: { standard: "web" },
};`;

describe('manual completion — validation', () => {
  it('accepts completion.mode: "manual"', () => {
    createBareProject(testRoot, MANUAL_CONFIG);
    const { errors } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
  });

  it('rejects unknown completion.mode values', () => {
    createBareProject(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "bogus" },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"completion.mode" must be "quiz", "percentage", or "manual"',
      ),
    );
  });

  it('accepts completion.trigger: "page" with a completesOn page present', () => {
    createProjectWithCompletesOn(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual", trigger: "page" },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
  });

  it('errors on completion.trigger: "page" when no completesOn page exists', () => {
    createBareProject(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual", trigger: "page" },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        'completion.mode is "manual" with trigger: "page", but no page declares pageConfig.completesOn: "view"',
      ),
    );
  });

  it('errors on invalid completion.trigger values under manual', () => {
    createBareProject(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual", trigger: "scroll" },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"completion.trigger" must be "page" or omitted, got "scroll"',
      ),
    );
  });

  it('passes when completion.trigger is omitted regardless of completesOn presence', () => {
    createBareProject(testRoot, MANUAL_CONFIG);
    const { errors } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
  });

  it('accepts requireSuccessStatus: "passed" / "failed"', () => {
    for (const v of ['passed', 'failed']) {
      const dir = createTestDir();
      try {
        createBareProject(
          dir,
          `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual", requireSuccessStatus: "${v}" },
  export: { standard: "web" },
};`,
        );
        const { errors } = validateProject(dir);
        expect(errors).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('rejects requireSuccessStatus: "unknown"', () => {
    createBareProject(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual", requireSuccessStatus: "unknown" },
  export: { standard: "web" },
};`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining(
        '"completion.requireSuccessStatus" must be "passed" or "failed"',
      ),
    );
  });

  it('warns (not errors) when a page has quiz.graded:true under manual mode', () => {
    writeConfig(testRoot, MANUAL_CONFIG);
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "L" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/check.svelte',
      `<script module>
  export const pageConfig = { quiz: { graded: true, gatesProgress: false, maxAttempts: 3 } };
</script>
<h1>Check</h1>`,
    );
    const { errors, warnings } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
    expect(
      warnings.some((w) =>
        /quiz\.graded is true under completion\.mode: "manual"/.test(w),
      ),
    ).toBe(true);
  });

  it('errors when pageConfig.completesOn is not "view"', () => {
    writeConfig(testRoot, MANUAL_CONFIG);
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "L" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/finale.svelte',
      `<script module>
  export const pageConfig = { completesOn: "scroll" };
</script>
<h1>Finale</h1>`,
    );
    const { errors } = validateProject(testRoot);
    expect(errors).toContainEqual(
      expect.stringContaining('pageConfig.completesOn must be "view"'),
    );
  });

  it('warns when percentageThreshold is set under manual', () => {
    createBareProject(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual", percentageThreshold: 80 },
  export: { standard: "web" },
};`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.some((w) =>
        /"completion\.percentageThreshold" is ignored/.test(w),
      ),
    ).toBe(true);
  });

  it('warns when completesOn is set under non-manual mode', () => {
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
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "L" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/finale.svelte',
      `<script module>
  export const pageConfig = { completesOn: "view" };
</script>
<h1>F</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.some((w) => /pageConfig\.completesOn is ignored/.test(w)),
    ).toBe(true);
  });

  it('warns when a page has both completesOn:"view" and a quiz block', () => {
    writeConfig(testRoot, MANUAL_CONFIG);
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "L" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/intro.svelte',
      '<h1>Intro</h1>',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/finale.svelte',
      `<script module>
  export const pageConfig = { completesOn: "view", quiz: { graded: false, maxAttempts: 1 } };
</script>
<h1>F</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.some((w) =>
        /completion fires on view, before the quiz can be answered/.test(w),
      ),
    ).toBe(true);
  });

  it('warns when first nav-ordered page has completesOn:"view" (sequential)', () => {
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "sequential" },
  completion: { mode: "manual" },
  export: { standard: "web" },
};`,
    );
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "L", pages: ["intro", "outro"] };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/intro.svelte',
      `<script module>
  export const pageConfig = { completesOn: "view" };
</script>
<h1>Intro</h1>`,
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/outro.svelte',
      '<h1>Outro</h1>',
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.some((w) =>
        /first page — the course will complete immediately on launch/.test(w),
      ),
    ).toBe(true);
  });

  it('warns when first nav-ordered page has completesOn:"view" (free)', () => {
    writeConfig(
      testRoot,
      `export default {
  title: "T",
  navigation: { mode: "free" },
  completion: { mode: "manual" },
  export: { standard: "web" },
};`,
    );
    mkdirp(testRoot, 'assets');
    mkdirp(testRoot, 'pages', '01-section', '01-lesson');
    writeFile(
      testRoot,
      'pages/01-section/_meta.js',
      'export default { title: "S" };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/_meta.js',
      'export default { title: "L", pages: ["a"] };',
    );
    writeFile(
      testRoot,
      'pages/01-section/01-lesson/a.svelte',
      `<script module>
  export const pageConfig = { completesOn: "view" };
</script>
<h1>A</h1>`,
    );
    const { warnings } = validateProject(testRoot);
    expect(
      warnings.some((w) =>
        /first page — the course will complete immediately on launch/.test(w),
      ),
    ).toBe(true);
  });

  it('scoring may be omitted under manual; runtime defaults passingScore to 0', () => {
    createBareProject(testRoot, MANUAL_CONFIG);
    const { errors } = validateProject(testRoot);
    expect(errors).toHaveLength(0);
  });
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
    const progress = new ProgressState(new Set());
    expect(progress.completionStatus).toBe('incomplete');
    expect(progress.manuallyCompleted).toBe(false);

    progress.markCompleteManually();
    expect(progress.completionStatus).toBe('complete');
    expect(progress.manuallyCompleted).toBe(true);

    const versionAfterFirst = progress.version;
    progress.markCompleteManually();
    expect(progress.version).toBe(versionAfterFirst);
  });

  it('recalculateCompletion is a no-op once manuallyCompleted is true', () => {
    const manifest = createManifest(4);
    // Configure as percentage so recalc would normally flip back to incomplete;
    // the manuallyCompleted latch must override that.
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
    });
    const progress = new ProgressState(gradedQuizIndices(manifest));

    progress.markCompleteManually();
    expect(progress.completionStatus).toBe('complete');

    // Visit nothing — percentage recalc would normally set to "incomplete".
    progress.recalculateCompletion(manifest.totalPages, config);
    expect(progress.completionStatus).toBe('complete');
  });

  it('recalculateCompletion under manual mode never sets status', () => {
    const manifest = createManifest(4);
    const config = manualConfig();
    const progress = new ProgressState(gradedQuizIndices(manifest));

    progress.recalculateCompletion(manifest.totalPages, config);
    expect(progress.completionStatus).toBe('incomplete');
  });

  it('recalculateSuccess honors requireSuccessStatus only after manual mark', () => {
    const manifest = createManifest(2);
    const config = manualConfig({ requireSuccessStatus: 'passed' });
    const progress = new ProgressState(gradedQuizIndices(manifest));

    // Before marking complete: stays unknown.
    progress.recalculateSuccess(config);
    expect(progress.successStatus).toBe('unknown');

    progress.markCompleteManually();
    progress.recalculateSuccess(config);
    expect(progress.successStatus).toBe('passed');
  });

  it('recalculateSuccess stays unknown when requireSuccessStatus is omitted', () => {
    const manifest = createManifest(2);
    const config = manualConfig();
    const progress = new ProgressState(gradedQuizIndices(manifest));

    progress.markCompleteManually();
    progress.recalculateSuccess(config);
    expect(progress.successStatus).toBe('unknown');
  });

  it('manuallyCompleted getter reflects internal latch', () => {
    const progress = new ProgressState(new Set());
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

import {
  useCompletion,
  __resetUseCompletionWarning,
} from '../src/runtime/hooks.svelte.js';
import { NavigationState } from '../src/runtime/navigation.svelte.js';

function makeNavCtx(progress: ProgressState, config: CourseConfig) {
  const manifest = createManifest(3);
  const nav = new NavigationState(manifest, progress, config);
  return { nav, manifest, progress, config };
}

describe('manual completion — useCompletion hook', () => {
  beforeEach(() => {
    ctxStore.clear();
    __resetUseCompletionWarning();
  });

  it('markComplete flips progress and reflects completionStatus', () => {
    const progress = new ProgressState(new Set());
    const config = manualConfig();
    ctxStore.set('tessera-nav', makeNavCtx(progress, config));

    const handle = useCompletion();
    expect(handle.completionStatus).toBe('incomplete');

    handle.markComplete();
    expect(progress.completionStatus).toBe('complete');
    expect(handle.completionStatus).toBe('complete');
  });

  it('markComplete is a no-op outside manual mode and warns once per session', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const progress = new ProgressState(new Set());
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
    warn.mockRestore();
  });

  it('throws when called outside a Tessera course', () => {
    expect(() => useCompletion()).toThrow(
      /must be called inside a Tessera course/,
    );
  });

  it('flips successStatus when requireSuccessStatus is set', () => {
    const progress = new ProgressState(new Set());
    const config = manualConfig({ requireSuccessStatus: 'passed' });
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

import {
  SCORM12Adapter,
  type SCORM12API,
} from '../src/runtime/adapters/scorm12.js';
import {
  SCORM2004Adapter,
  type SCORM2004API,
} from '../src/runtime/adapters/scorm2004.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';

function mockSCORM12(): SCORM12API {
  const store = new Map<string, string>();
  return {
    LMSInitialize: vi.fn().mockReturnValue('true'),
    LMSFinish: vi.fn().mockReturnValue('true'),
    LMSGetValue: vi.fn((key: string) => store.get(key) ?? ''),
    LMSSetValue: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return 'true';
    }),
    LMSCommit: vi.fn().mockReturnValue('true'),
    LMSGetLastError: vi.fn().mockReturnValue('0'),
    LMSGetErrorString: vi.fn().mockReturnValue(''),
    LMSGetDiagnostic: vi.fn().mockReturnValue(''),
  };
}

function mockSCORM2004(): SCORM2004API {
  const store = new Map<string, string>();
  return {
    Initialize: vi.fn().mockReturnValue('true'),
    Terminate: vi.fn().mockReturnValue('true'),
    GetValue: vi.fn((key: string) => store.get(key) ?? ''),
    SetValue: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return 'true';
    }),
    Commit: vi.fn().mockReturnValue('true'),
    GetLastError: vi.fn().mockReturnValue('0'),
    GetErrorString: vi.fn().mockReturnValue(''),
    GetDiagnostic: vi.fn().mockReturnValue(''),
  };
}

const flush = () => new Promise<void>((r) => setTimeout(r, 50));

describe('manual completion — adapter integration', () => {
  it('SCORM 1.2 writes lesson_status = completed when only completion is set', async () => {
    const api = mockSCORM12();
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
    const api = mockSCORM12();
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
    const api = mockSCORM2004();
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
    const api = mockSCORM2004();
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

import type { SavedState } from '../src/runtime/persistence.js';

describe('manual completion — persistence', () => {
  it('serializes m: 1 only when manuallyCompleted is true', () => {
    const progress = new ProgressState(new Set());
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
    const progress = new ProgressState(gradedQuizIndices(manifest));
    const config = manualConfig();

    // Restore-side equivalent: progress.markCompleteManually() when saved.m === 1
    const saved: SavedState = { b: 0, v: [], q: {}, d: 0, m: 1 };
    if (saved.m === 1) progress.markCompleteManually();
    progress.recalculateCompletion(manifest.totalPages, config);
    progress.recalculateSuccess(config);

    expect(progress.completionStatus).toBe('complete');
    expect(progress.manuallyCompleted).toBe(true);
  });

  it('restored m: 1 holds even if completion.mode changed between sessions', () => {
    const manifest = createManifest(4);
    const progress = new ProgressState(gradedQuizIndices(manifest));
    // Pretend the course was redeployed under percentage mode.
    const config = createConfig({
      completion: { mode: 'percentage', percentageThreshold: 100 },
    });

    progress.markCompleteManually();
    // No pages visited — percentage recalc would normally flip to incomplete.
    progress.recalculateCompletion(manifest.totalPages, config);
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
    const manifest = { sections: [], pages, totalPages: pages.length };
    progress.markVisited(index);
    if (
      pages[index].completesOn === 'view' &&
      config.completion.mode === 'manual'
    ) {
      progress.markCompleteManually();
    }
    progress.recalculateCompletion(manifest.totalPages, config);
    progress.recalculateSuccess(config);
  }

  it('marks completion on first visit to a completesOn:"view" page', () => {
    const pages = [
      { ...pageWithCompletesOn(0), completesOn: undefined } as ManifestPage,
      pageWithCompletesOn(1),
    ];
    const progress = new ProgressState(new Set());
    const config = manualConfig();

    loadPage(0, pages, progress, config);
    expect(progress.completionStatus).toBe('incomplete');

    loadPage(1, pages, progress, config);
    expect(progress.completionStatus).toBe('complete');
  });

  it('revisiting a completesOn page is idempotent', () => {
    const pages = [pageWithCompletesOn(0)];
    const progress = new ProgressState(new Set());
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
    const progress = new ProgressState(new Set());
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
    adapter: {
      setCompletionStatus(s: 'incomplete' | 'complete'): void;
      setSuccessStatus(s: 'unknown' | 'passed' | 'failed'): void;
      commit(): void;
    },
  ) {
    let prevCompletion: 'incomplete' | 'complete' = progress.completionStatus;
    let prevSuccess: 'unknown' | 'passed' | 'failed' = progress.successStatus;
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
    const progress = new ProgressState(gradedQuizIndices(manifest));
    const config = manualConfig({ requireSuccessStatus: 'passed' });
    const adapter = {
      setCompletionStatus: vi.fn(),
      setSuccessStatus: vi.fn(),
      commit: vi.fn(),
    };

    const flush = makeStatusPusher(progress, adapter);

    progress.markCompleteManually();
    progress.recalculateSuccess(config);
    flush();

    expect(adapter.setCompletionStatus).toHaveBeenCalledWith('complete');
    expect(adapter.setSuccessStatus).toHaveBeenCalledWith('passed');
    expect(adapter.commit).toHaveBeenCalled();
  });

  it('does not push success on markComplete when requireSuccessStatus is omitted', () => {
    const manifest = createManifest(2);
    const progress = new ProgressState(gradedQuizIndices(manifest));
    const config = manualConfig();
    const adapter = {
      setCompletionStatus: vi.fn(),
      setSuccessStatus: vi.fn(),
      commit: vi.fn(),
    };

    const flush = makeStatusPusher(progress, adapter);

    progress.markCompleteManually();
    progress.recalculateSuccess(config);
    flush();

    expect(adapter.setCompletionStatus).toHaveBeenCalledWith('complete');
    // successStatus stayed 'unknown' — no transition, no push.
    expect(adapter.setSuccessStatus).not.toHaveBeenCalled();
  });

  it('pushes setSuccessStatus("failed") under requireSuccessStatus: "failed"', () => {
    const manifest = createManifest(2);
    const progress = new ProgressState(gradedQuizIndices(manifest));
    const config = manualConfig({ requireSuccessStatus: 'failed' });
    const adapter = {
      setCompletionStatus: vi.fn(),
      setSuccessStatus: vi.fn(),
      commit: vi.fn(),
    };

    const flush = makeStatusPusher(progress, adapter);

    progress.markCompleteManually();
    progress.recalculateSuccess(config);
    flush();

    expect(adapter.setSuccessStatus).toHaveBeenCalledWith('failed');
  });
});
