import { describe, it, expect } from 'vitest';
import { resolveExportStandard } from '../src/plugin/index.js';
import type { CourseConfigRead } from '../src/plugin/manifest.js';

const ok = (standard?: string): CourseConfigRead => ({
  ok: true,
  config: standard === undefined ? {} : { export: { standard } },
});

describe('resolveExportStandard', () => {
  it('uses the course config standard when no override is given', () => {
    expect(resolveExportStandard(ok('scorm12'))).toBe('scorm12');
  });

  it('defaults to web when the config omits export.standard', () => {
    expect(resolveExportStandard(ok())).toBe('web');
  });

  it('lets a CLI override win over the config standard', () => {
    expect(resolveExportStandard(ok('web'), 'cmi5')).toBe('cmi5');
  });

  it('reports unknown for an unreadable config with no override', () => {
    expect(resolveExportStandard({ ok: false, reason: 'missing' })).toBe(
      'unknown',
    );
  });

  it('honours the override even when the config is unreadable', () => {
    expect(
      resolveExportStandard({ ok: false, reason: 'missing' }, 'scorm2004'),
    ).toBe('scorm2004');
  });
});
