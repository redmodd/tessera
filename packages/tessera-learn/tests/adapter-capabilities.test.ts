// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import {
  SCORM12Adapter,
  type SCORM12API,
} from '../src/runtime/adapters/scorm12.js';
import {
  SCORM2004Adapter,
  type SCORM2004API,
} from '../src/runtime/adapters/scorm2004.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { createConfig } from './helpers.js';

const ACTIVITY = 'https://example.com/course';

function scorm12Api(values: Record<string, string>): SCORM12API {
  return {
    LMSInitialize: () => 'true',
    LMSFinish: () => 'true',
    LMSGetValue: (k) => values[k] ?? '',
    LMSSetValue: () => 'true',
    LMSCommit: () => 'true',
    LMSGetLastError: () => '0',
    LMSGetErrorString: () => '',
    LMSGetDiagnostic: () => '',
  };
}

function scorm2004Api(values: Record<string, string>): SCORM2004API {
  return {
    Initialize: () => 'true',
    Terminate: () => 'true',
    GetValue: (k) => values[k] ?? '',
    SetValue: () => 'true',
    Commit: () => 'true',
    GetLastError: () => '0',
    GetErrorString: () => '',
    GetDiagnostic: () => '',
  };
}

describe('WebAdapter capabilities', () => {
  const adapter = new WebAdapter(createConfig());

  it('is not connected and has nothing to derive or share', () => {
    expect(adapter.connected).toBe(false);
    expect(adapter.deriveActor(ACTIVITY)).toBeNull();
    expect(adapter.launchPublisher()).toBeNull();
    expect(adapter.getMasteryScore()).toBeNull();
  });

  it('does not seed, so App re-reports restored values', () => {
    expect(adapter.seedLifecycle('complete', 'passed', 90)).toBe(false);
  });
});

describe('SCORM adapter capabilities', () => {
  it('SCORM 1.2 derives the actor from cmi.core learner fields', () => {
    const adapter = new SCORM12Adapter(
      scorm12Api({
        'cmi.core.student_id': 'l-1',
        'cmi.core.student_name': 'Doe, Jane',
      }),
    );
    expect(adapter.connected).toBe(true);
    expect(adapter.deriveActor(ACTIVITY)).toEqual({
      account: { homePage: 'https://example.com', name: 'l-1' },
      name: 'Doe, Jane',
      objectType: 'Agent',
    });
    expect(adapter.launchPublisher()).toBeNull();
    expect(adapter.seedLifecycle('complete', 'passed', 90)).toBe(false);
  });

  it('SCORM 2004 derives the actor from cmi.learner_id, honoring the homePage override', () => {
    const adapter = new SCORM2004Adapter(
      scorm2004Api({ 'cmi.learner_id': 'l-2' }),
    );
    expect(adapter.connected).toBe(true);
    expect(adapter.deriveActor(ACTIVITY, 'https://idp.example.org')).toEqual({
      account: { homePage: 'https://idp.example.org', name: 'l-2' },
      objectType: 'Agent',
    });
    expect(adapter.launchPublisher()).toBeNull();
    expect(adapter.seedLifecycle('complete', 'passed', 90)).toBe(false);
  });

  it('derives no actor when the LMS leaves the learner id empty', () => {
    expect(new SCORM12Adapter(scorm12Api({})).deriveActor(ACTIVITY)).toBeNull();
  });
});

describe('launch adapter capabilities', () => {
  const actor = { mbox: 'mailto:learner@example.com', objectType: 'Agent' };

  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('shares its publisher and derives the launch actor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 404 })),
    );
    const qs = new URLSearchParams({
      endpoint: 'https://lrs.example/xapi/',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify(actor),
      activity_id: ACTIVITY,
    });
    window.history.replaceState({}, '', `/?${qs}`);
    const adapter = new XAPIAdapter();
    expect(adapter.connected).toBe(true);
    expect(adapter.launchPublisher()).toBeNull();

    await adapter.init();
    expect(adapter.launchPublisher()?.getActor()).toEqual(actor);
    expect(adapter.deriveActor()).toEqual(actor);
  });

  it('seeds, so App skips re-reporting restored values', () => {
    expect(new XAPIAdapter().seedLifecycle('complete', 'passed', 90)).toBe(
      true,
    );
  });
});
