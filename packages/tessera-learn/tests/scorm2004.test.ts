import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCORM2004Adapter,
  type SCORM2004API,
} from '../src/runtime/adapters/scorm2004.js';
import type { SavedState } from '../src/runtime/persistence.js';

function createMockAPI(overrides: Partial<SCORM2004API> = {}): SCORM2004API {
  const store = new Map<string, string>();
  return {
    Initialize: vi.fn().mockReturnValue('true'),
    Terminate: vi.fn().mockReturnValue('true'),
    GetValue: vi.fn((key: string) => store.get(key) || ''),
    SetValue: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return 'true';
    }),
    Commit: vi.fn().mockReturnValue('true'),
    GetLastError: vi.fn().mockReturnValue('0'),
    GetErrorString: vi.fn().mockReturnValue(''),
    GetDiagnostic: vi.fn().mockReturnValue(''),
    ...overrides,
  };
}

/** Wait for the async write queue to flush */
async function flush() {
  await new Promise((r) => setTimeout(r, 50));
}

describe('SCORM2004Adapter', () => {
  let api: SCORM2004API;
  let adapter: SCORM2004Adapter;

  beforeEach(() => {
    api = createMockAPI();
    adapter = new SCORM2004Adapter(api);
  });

  it('calls Initialize on init', async () => {
    await adapter.init();
    expect(api.Initialize).toHaveBeenCalledWith('');
  });

  it('reads suspend_data on init', async () => {
    const state: SavedState = {
      b: 3,
      v: [0, 1, 2, 3],
      q: { '2': 80 },
      d: 100,
    };
    (api.GetValue as any).mockImplementation((key: string) =>
      key === 'cmi.suspend_data' ? JSON.stringify(state) : ''
    );
    await adapter.init();
    expect(adapter.getState()).toEqual(state);
  });

  it('returns null state when no suspend_data', async () => {
    await adapter.init();
    expect(adapter.getState()).toBeNull();
  });

  it('returns null state for corrupted data', async () => {
    (api.GetValue as any).mockReturnValue('{broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await adapter.init();
    expect(adapter.getState()).toBeNull();
    expect(warn.mock.calls.some((c) => /not valid JSON/.test(String(c[0])))).toBe(true);
    warn.mockRestore();
  });

  it('saves state to suspend_data via queue', async () => {
    await adapter.init();
    const state: SavedState = {
      b: 5,
      v: [0, 1, 2, 3, 4, 5],
      q: {},
      d: 200,
    };
    adapter.saveState(state);
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith(
      'cmi.suspend_data',
      JSON.stringify(state)
    );
  });

  describe('suspend_data size guard', () => {
    it('warns once when serialized state exceeds 64000 chars', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      const state: SavedState = {
        b: 0,
        v: [],
        q: {},
        d: 0,
        u: { big: 'x'.repeat(64100) },
      };
      adapter.saveState(state);
      adapter.saveState(state);
      await flush();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/SCORM 2004 4E cmi\.suspend_data 64000/);
      warn.mockRestore();
    });

    it('does not warn at the SCORM 1.2 threshold (would warn under 1.2)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      adapter.saveState({
        b: 0,
        v: [],
        q: {},
        d: 0,
        u: { big: 'y'.repeat(5000) },
      });
      await flush();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('sets score with raw, min, max, and scaled via queue', async () => {
    adapter.setScore(85);
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith('cmi.score.raw', '85');
    expect(api.SetValue).toHaveBeenCalledWith('cmi.score.min', '0');
    expect(api.SetValue).toHaveBeenCalledWith('cmi.score.max', '100');
    expect(api.SetValue).toHaveBeenCalledWith('cmi.score.scaled', '0.85');
  });

  it('rounds fractional scores to real(10,7) — no >7-digit decimal trips 406', async () => {
    // 7 / 11 * 100 = 63.6363636363... → raw must not exceed 7 fractional digits
    adapter.setScore((7 / 11) * 100);
    await flush();
    const rawCall = (api.SetValue as any).mock.calls.find(
      ([k]: [string]) => k === 'cmi.score.raw'
    );
    const scaledCall = (api.SetValue as any).mock.calls.find(
      ([k]: [string]) => k === 'cmi.score.scaled'
    );
    expect(rawCall[1]).toBe('63.6363636');
    expect(scaledCall[1]).toBe('0.6363636');
  });

  it('clamps cmi.score.scaled to the spec-defined [-1,1] band', async () => {
    adapter.setScore(150);
    await flush();
    const scaledCall = (api.SetValue as any).mock.calls.find(
      ([k]: [string]) => k === 'cmi.score.scaled'
    );
    expect(scaledCall[1]).toBe('1');
  });

  it('sets completion_status to completed', async () => {
    adapter.setCompletionStatus('complete');
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith(
      'cmi.completion_status',
      'completed'
    );
  });

  it('sets completion_status to incomplete', async () => {
    adapter.setCompletionStatus('incomplete');
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith(
      'cmi.completion_status',
      'incomplete'
    );
  });

  it('sets success_status to passed', async () => {
    adapter.setSuccessStatus('passed');
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith('cmi.success_status', 'passed');
  });

  it('sets success_status to failed', async () => {
    adapter.setSuccessStatus('failed');
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith('cmi.success_status', 'failed');
  });

  it('sets duration in ISO 8601 format via queue', async () => {
    adapter.setDuration(3661);
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith('cmi.session_time', 'PT1H1M1S');
  });

  it('commits via Commit through queue', async () => {
    adapter.commit();
    await flush();
    expect(api.Commit).toHaveBeenCalledWith('');
  });

  it('terminate drains queue then commits and terminates synchronously', () => {
    adapter.setScore(90);
    adapter.setDuration(100);

    adapter.terminate();

    expect(api.SetValue).toHaveBeenCalledWith('cmi.score.raw', '90');
    expect(api.SetValue).toHaveBeenCalledWith(
      'cmi.session_time',
      'PT1M40S'
    );
    expect(api.Commit).toHaveBeenCalledWith('');
    expect(api.Terminate).toHaveBeenCalledWith('');
  });

  it('terminate is idempotent', () => {
    adapter.terminate();
    adapter.terminate();
    expect(api.Terminate).toHaveBeenCalledTimes(1);
  });

  it('operations are queued sequentially', async () => {
    const order: string[] = [];
    (api.SetValue as any).mockImplementation(
      (key: string, _value: string) => {
        order.push(key);
        return 'true';
      }
    );

    adapter.saveState({ b: 0, v: [], q: {}, d: 0 });
    adapter.setScore(85);

    await flush();

    const suspendIdx = order.indexOf('cmi.suspend_data');
    const scoreIdx = order.indexOf('cmi.score.raw');
    expect(suspendIdx).toBeLessThan(scoreIdx);
  });

  it('writes cmi.location from SavedState.b on saveState', async () => {
    await adapter.init();
    adapter.saveState({ b: 7, v: [0, 1, 2, 3, 4, 5, 6, 7], q: {}, d: 100 });
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith('cmi.location', '7');
  });

  it('writes cmi.progress_measure=1 when setCompletionStatus is complete', async () => {
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await flush();
    expect(api.SetValue).toHaveBeenCalledWith('cmi.progress_measure', '1');
  });

  it('does not write progress_measure when status is incomplete', async () => {
    await adapter.init();
    adapter.setCompletionStatus('incomplete');
    await flush();
    const progressCalls = (api.SetValue as any).mock.calls.filter(
      ([k]: [string]) => k === 'cmi.progress_measure'
    );
    expect(progressCalls).toHaveLength(0);
  });

  describe('cmi.mode honoring (browse / review launches)', () => {
    function mockReview(): void {
      (api.GetValue as any).mockImplementation((key: string) =>
        key === 'cmi.mode' ? 'review' : ''
      );
    }
    function mockBrowse(): void {
      (api.GetValue as any).mockImplementation((key: string) =>
        key === 'cmi.mode' ? 'browse' : ''
      );
    }
    function settersDidNotFire(): void {
      const writes = (api.SetValue as any).mock.calls.map(([k]: [string]) => k);
      expect(writes).not.toContain('cmi.score.raw');
      expect(writes).not.toContain('cmi.completion_status');
      expect(writes).not.toContain('cmi.success_status');
      expect(writes).not.toContain('cmi.session_time');
      expect(writes).not.toContain('cmi.exit');
      expect(writes).not.toContain('cmi.suspend_data');
      expect(writes).not.toContain('cmi.location');
    }

    it('exposes the LMS-supplied mode via getLaunchMode()', async () => {
      mockReview();
      await adapter.init();
      expect(adapter.getLaunchMode()).toBe('review');
    });

    it('refuses every learner-record write in review mode', async () => {
      mockReview();
      await adapter.init();
      adapter.setScore(85);
      adapter.setCompletionStatus('complete');
      adapter.setSuccessStatus('passed');
      adapter.setDuration(100);
      adapter.setExit('normal');
      adapter.saveState({ b: 3, v: [0, 1, 2, 3], q: {}, d: 100 });
      adapter.reportInteraction('q1', { type: 'true-false', response: true }, true);
      await flush();
      settersDidNotFire();
    });

    it('refuses every learner-record write in browse mode', async () => {
      mockBrowse();
      await adapter.init();
      adapter.setScore(85);
      adapter.setCompletionStatus('complete');
      adapter.saveState({ b: 3, v: [], q: {}, d: 0 });
      await flush();
      settersDidNotFire();
    });
  });

  describe('LMS-supplied thresholds', () => {
    it('reads cmi.scaled_passing_score and exposes via getMasteryScore()', async () => {
      (api.GetValue as any).mockImplementation((key: string) =>
        key === 'cmi.scaled_passing_score' ? '0.7' : ''
      );
      await adapter.init();
      expect(adapter.getMasteryScore()).toBe(0.7);
    });

    it('reads cmi.completion_threshold and exposes via getCompletionThreshold()', async () => {
      (api.GetValue as any).mockImplementation((key: string) =>
        key === 'cmi.completion_threshold' ? '0.8' : ''
      );
      await adapter.init();
      expect(adapter.getCompletionThreshold()).toBe(0.8);
    });

    it('returns null for out-of-range or missing thresholds', async () => {
      (api.GetValue as any).mockImplementation((key: string) =>
        key === 'cmi.scaled_passing_score' ? '1.5' : ''
      );
      await adapter.init();
      expect(adapter.getMasteryScore()).toBeNull();
      expect(adapter.getCompletionThreshold()).toBeNull();
    });
  });

  describe('reportInteraction', () => {
    function setValuesFor(prefix: string): Record<string, string> {
      const result: Record<string, string> = {};
      for (const call of (api.SetValue as any).mock.calls as Array<[string, string]>) {
        if (call[0].startsWith(prefix)) result[call[0]] = call[1];
      }
      return result;
    }

    it('writes choice interaction fields', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.id']).toBe('q1');
      expect(v['cmi.interactions.0.type']).toBe('choice');
      expect(v['cmi.interactions.0.learner_response']).toBe('a[,]b');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('a');
      expect(v['cmi.interactions.0.result']).toBe('incorrect');
      // Zone-free, second-resolution — see formatISO8601Timestamp tests.
      expect(v['cmi.interactions.0.timestamp']).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    });

    it('writes true-false interaction', async () => {
      adapter.reportInteraction(
        'tf1',
        { type: 'true-false', response: true, correct: true },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('true-false');
      expect(v['cmi.interactions.0.learner_response']).toBe('true');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('true');
      expect(v['cmi.interactions.0.result']).toBe('correct');
    });

    it('writes fill-in interaction', async () => {
      adapter.reportInteraction(
        'fi1',
        { type: 'fill-in', response: 'Paris', correct: ['Paris', 'paris'] },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('fill-in');
      expect(v['cmi.interactions.0.learner_response']).toBe('Paris');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('Paris[,]paris');
    });

    it('writes matching interaction', async () => {
      adapter.reportInteraction(
        'm1',
        {
          type: 'matching',
          response: [['a', '1'], ['b', '2']],
          correct: [['a', '1'], ['b', '2']],
        },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('matching');
      expect(v['cmi.interactions.0.learner_response']).toBe('a[.]1[,]b[.]2');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('a[.]1[,]b[.]2');
    });

    it('writes sequencing interaction', async () => {
      adapter.reportInteraction(
        's1',
        { type: 'sequencing', response: ['x', 'y', 'z'], correct: ['x', 'y', 'z'] },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('sequencing');
      expect(v['cmi.interactions.0.learner_response']).toBe('x[,]y[,]z');
    });

    it('slugs response and correct identifiers to short_identifier_type', async () => {
      // choice and sequencing share the same identifier-mapping branch, so
      // testing one covers both. Use sequencing with realistic demo content
      // exercising spaces, apostrophes, and quotes.
      adapter.reportInteraction(
        's2',
        {
          type: 'sequencing',
          response: ['Sputnik 1 launched', 'Apollo 8\'s "Earthrise" photo'],
          correct: ['Sputnik 1 launched', 'Apollo 8\'s "Earthrise" photo'],
        },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.learner_response']).toBe(
        'Sputnik_1_launched[,]Apollo_8_s_Earthrise_photo'
      );
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe(
        'Sputnik_1_launched[,]Apollo_8_s_Earthrise_photo'
      );
    });

    it('writes numeric interaction', async () => {
      adapter.reportInteraction(
        'n1',
        { type: 'numeric', response: 7, correct: { min: 5, max: 10 } },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('numeric');
      expect(v['cmi.interactions.0.learner_response']).toBe('7');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('5[:]10');
    });

    it('writes performance interaction', async () => {
      adapter.reportInteraction(
        'p1',
        {
          type: 'performance',
          response: [['stepA', 1], ['stepB', 'x']],
          correct: [['stepA', 1], ['stepB', 'x']],
        },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('performance');
      expect(v['cmi.interactions.0.learner_response']).toBe('stepA[.]1[,]stepB[.]x');
    });

    it('omits correct_responses when no correct provided', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'likert', response: 'agree' },
        null
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBeUndefined();
      expect(v['cmi.interactions.0.result']).toBeUndefined();
    });

    it('increments index across multiple interactions', async () => {
      adapter.reportInteraction('q1', { type: 'other', response: 'a', correct: 'a' }, true);
      adapter.reportInteraction('q2', { type: 'other', response: 'b', correct: 'b' }, true);
      await flush();
      expect((api.SetValue as any).mock.calls.some(
        (c: [string, string]) => c[0] === 'cmi.interactions.0.id' && c[1] === 'q1'
      )).toBe(true);
      expect((api.SetValue as any).mock.calls.some(
        (c: [string, string]) => c[0] === 'cmi.interactions.1.id' && c[1] === 'q2'
      )).toBe(true);
    });
  });
});
