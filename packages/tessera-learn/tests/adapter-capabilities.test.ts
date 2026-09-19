// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { WebAdapter } from '../src/runtime/adapters/web.js';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import { SCORM2004Adapter } from '../src/runtime/adapters/scorm2004.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { createConfig, scorm12Api, scorm2004Api } from './helpers.js';

const ACTIVITY = 'https://example.com/course';

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
  it('SCORM 1.2 derives the actor from its LMS', () => {
    const adapter = new SCORM12Adapter(
      scorm12Api({ 'cmi.core.student_id': 'l-1' }),
    );
    expect(adapter.connected).toBe(true);
    expect(adapter.deriveActor(ACTIVITY)).toEqual({
      account: { homePage: 'https://example.com', name: 'l-1' },
      objectType: 'Agent',
    });
    expect(adapter.launchPublisher()).toBeNull();
    expect(adapter.seedLifecycle('complete', 'passed', 90)).toBe(false);
  });

  it('SCORM 2004 derives the actor from its LMS', () => {
    const adapter = new SCORM2004Adapter(
      scorm2004Api({ 'cmi.learner_id': 'l-2' }),
    );
    expect(adapter.connected).toBe(true);
    expect(adapter.deriveActor(ACTIVITY)).toEqual({
      account: { homePage: 'https://example.com', name: 'l-2' },
      objectType: 'Agent',
    });
    expect(adapter.launchPublisher()).toBeNull();
    expect(adapter.seedLifecycle('complete', 'passed', 90)).toBe(false);
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
