// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { SCORM12Adapter } from '../src/runtime/adapters/scorm12.js';
import { SCORM2004Adapter } from '../src/runtime/adapters/scorm2004.js';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';
import { validateAgent } from '../src/runtime/xapi/validation.js';
import { scorm12Api, scorm2004Api } from './helpers.js';

const ACTIVITY = 'https://example.com/courses/1';

describe('SCORM deriveActor', () => {
  it('SCORM 1.2 builds an Identified Agent from cmi.core.student_id / student_name', () => {
    const adapter = new SCORM12Adapter(
      scorm12Api({
        'cmi.core.student_id': 'student-42',
        'cmi.core.student_name': 'Ada Lovelace',
      }),
    );
    const actor = adapter.deriveActor(ACTIVITY);
    expect(actor).toEqual({
      account: { homePage: 'https://example.com', name: 'student-42' },
      name: 'Ada Lovelace',
      objectType: 'Agent',
    });
    expect(validateAgent(actor)).toBeNull();
  });

  it('honors an actorAccountHomePage override', () => {
    const adapter = new SCORM12Adapter(
      scorm12Api({ 'cmi.core.student_id': 'sid' }),
    );
    expect(
      adapter.deriveActor(ACTIVITY, 'https://lms.example.com')?.account
        ?.homePage,
    ).toBe('https://lms.example.com');
  });

  it('returns null when the LMS has no learner id', () => {
    expect(new SCORM12Adapter(scorm12Api()).deriveActor(ACTIVITY)).toBeNull();
  });

  it('SCORM 2004 reads cmi.learner_id / cmi.learner_name', () => {
    const adapter = new SCORM2004Adapter(
      scorm2004Api({
        'cmi.learner_id': 'learner-7',
        'cmi.learner_name': 'Grace Hopper',
      }),
    );
    expect(adapter.deriveActor(ACTIVITY)).toEqual({
      account: { homePage: 'https://example.com', name: 'learner-7' },
      name: 'Grace Hopper',
      objectType: 'Agent',
    });
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
    expect(adapter.launchPublisher()).toBeNull();

    await adapter.init();
    expect(adapter.launchPublisher()?.getActor()).toEqual(actor);
    expect(adapter.deriveActor()).toEqual(actor);
  });
});
