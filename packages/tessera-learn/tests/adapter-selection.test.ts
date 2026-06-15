// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createAdapter,
  LMSAdapterError,
} from '../src/runtime/adapters/index.js';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import { SCORM2004Adapter } from '../src/runtime/adapters/scorm2004.js';
import { CMI5Adapter } from '../src/runtime/adapters/cmi5.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import type { CourseConfig } from '../src/runtime/types.js';

function makeConfig(standard: string): CourseConfig {
  return {
    title: 'Test Course',
    navigation: { mode: 'free' },
    completion: { mode: 'percentage' },
    scoring: { passingScore: 70 },
    export: { standard } as any,
  };
}

// Mock localStorage for WebAdapter
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
});

describe('createAdapter', () => {
  afterEach(() => {
    // Clean up any window.API stubs
    delete (window as any).API;
    delete (window as any).API_1484_11;
  });

  it('returns WebAdapter for standard "web"', () => {
    const adapter = createAdapter(makeConfig('web'));
    expect(adapter).toBeInstanceOf(WebAdapter);
  });

  it('returns WebAdapter for undefined standard', () => {
    const config = makeConfig('web');
    (config.export as any).standard = undefined;
    const adapter = createAdapter(config);
    expect(adapter).toBeInstanceOf(WebAdapter);
  });

  it('returns SCORM12Adapter when API is found', () => {
    (window as any).API = {
      LMSInitialize: () => 'true',
      LMSFinish: () => 'true',
      LMSGetValue: () => '',
      LMSSetValue: () => 'true',
      LMSCommit: () => 'true',
      LMSGetLastError: () => '0',
      LMSGetErrorString: () => '',
      LMSGetDiagnostic: () => '',
    };
    const adapter = createAdapter(makeConfig('scorm12'));
    expect(adapter).toBeInstanceOf(SCORM12Adapter);
  });

  it('falls back to WebAdapter for scorm12 when API not found (dev)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createAdapter(makeConfig('scorm12'));
    expect(adapter).toBeInstanceOf(WebAdapter);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SCORM 1.2 API not found'),
    );
    warnSpy.mockRestore();
  });

  it('returns SCORM2004Adapter when API_1484_11 is found', () => {
    (window as any).API_1484_11 = {
      Initialize: () => 'true',
      Terminate: () => 'true',
      GetValue: () => '',
      SetValue: () => 'true',
      Commit: () => 'true',
      GetLastError: () => '0',
      GetErrorString: () => '',
      GetDiagnostic: () => '',
    };
    const adapter = createAdapter(makeConfig('scorm2004'));
    expect(adapter).toBeInstanceOf(SCORM2004Adapter);
  });

  it('falls back to WebAdapter for scorm2004 when API not found (dev)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createAdapter(makeConfig('scorm2004'));
    expect(adapter).toBeInstanceOf(WebAdapter);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SCORM 2004 API not found'),
    );
    warnSpy.mockRestore();
  });

  it('falls back to WebAdapter for cmi5 when launch params not found (dev)', () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/'),
      writable: true,
      configurable: true,
    });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const adapter = createAdapter(makeConfig('cmi5'));
    expect(adapter).toBeInstanceOf(WebAdapter);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('cmi5 launch parameters not found'),
    );
    warnSpy.mockRestore();
  });

  it('returns CMI5Adapter when launch params are present', () => {
    const params = new URLSearchParams({
      fetch: 'https://lms.example.com/fetch',
      endpoint: 'https://lms.example.com/xapi/',
      activityId: 'https://example.com/course/1',
      actor: JSON.stringify({ mbox: 'mailto:test@example.com' }),
      registration: 'reg-123',
    });
    Object.defineProperty(window, 'location', {
      value: new URL(`http://localhost/?${params.toString()}`),
      writable: true,
      configurable: true,
    });
    const adapter = createAdapter(makeConfig('cmi5'));
    expect(adapter).toBeInstanceOf(CMI5Adapter);
  });

  it('returns XAPIAdapter when xapi launch params are present', () => {
    const params = new URLSearchParams({
      endpoint: 'https://lrs.example.com/xapi/',
      auth: 'Zm9vOmJhcg==',
      actor: JSON.stringify({ mbox: 'mailto:test@example.com' }),
      activity_id: 'urn:tessera:au:abc',
    });
    Object.defineProperty(window, 'location', {
      value: new URL(`http://localhost/?${params.toString()}`),
      writable: true,
      configurable: true,
    });
    const adapter = createAdapter(makeConfig('xapi'));
    expect(adapter).toBeInstanceOf(XAPIAdapter);
  });

  describe('production fail-loud (allowFallback: false)', () => {
    it('throws LMSAdapterError for scorm12 when API missing', () => {
      expect(() =>
        createAdapter(makeConfig('scorm12'), { allowFallback: false }),
      ).toThrow(LMSAdapterError);
      try {
        createAdapter(makeConfig('scorm12'), { allowFallback: false });
      } catch (err: any) {
        expect(err).toBeInstanceOf(LMSAdapterError);
        expect(err.standard).toBe('scorm12');
        expect(err.message).toContain('SCORM 1.2');
      }
    });

    it('throws LMSAdapterError for scorm2004 when API missing', () => {
      expect(() =>
        createAdapter(makeConfig('scorm2004'), { allowFallback: false }),
      ).toThrow(LMSAdapterError);
    });

    it('throws LMSAdapterError for cmi5 when launch params missing', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('http://localhost/'),
        writable: true,
        configurable: true,
      });
      expect(() =>
        createAdapter(makeConfig('cmi5'), { allowFallback: false }),
      ).toThrow(LMSAdapterError);
    });

    it('throws LMSAdapterError for xapi when launch params missing', () => {
      Object.defineProperty(window, 'location', {
        value: new URL('http://localhost/'),
        writable: true,
        configurable: true,
      });
      expect(() =>
        createAdapter(makeConfig('xapi'), { allowFallback: false }),
      ).toThrow(LMSAdapterError);
    });

    it('still returns WebAdapter for export.standard "web"', () => {
      const adapter = createAdapter(makeConfig('web'), {
        allowFallback: false,
      });
      expect(adapter).toBeInstanceOf(WebAdapter);
    });

    it('returns SCORM12Adapter when API is present', () => {
      (window as any).API = {
        LMSInitialize: () => 'true',
        LMSFinish: () => 'true',
        LMSGetValue: () => '',
        LMSSetValue: () => 'true',
        LMSCommit: () => 'true',
        LMSGetLastError: () => '0',
        LMSGetErrorString: () => '',
        LMSGetDiagnostic: () => '',
      };
      const adapter = createAdapter(makeConfig('scorm12'), {
        allowFallback: false,
      });
      expect(adapter).toBeInstanceOf(SCORM12Adapter);
    });
  });
});
