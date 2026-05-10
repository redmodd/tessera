import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  SCORM12Adapter,
  type SCORM12API,
} from '../src/runtime/adapters/scorm12.js';
import type { SavedState } from '../src/runtime/persistence.js';

function createMockAPI(overrides: Partial<SCORM12API> = {}): SCORM12API {
  const store = new Map<string, string>();
  return {
    LMSInitialize: vi.fn().mockReturnValue('true'),
    LMSFinish: vi.fn().mockReturnValue('true'),
    LMSGetValue: vi.fn((key: string) => store.get(key) || ''),
    LMSSetValue: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return 'true';
    }),
    LMSCommit: vi.fn().mockReturnValue('true'),
    LMSGetLastError: vi.fn().mockReturnValue('0'),
    LMSGetErrorString: vi.fn().mockReturnValue(''),
    LMSGetDiagnostic: vi.fn().mockReturnValue(''),
    ...overrides,
  };
}

/** Wait for the async write queue to flush */
async function flush() {
  await new Promise((r) => setTimeout(r, 50));
}

describe('SCORM12Adapter', () => {
  let api: SCORM12API;
  let adapter: SCORM12Adapter;

  beforeEach(() => {
    api = createMockAPI();
    adapter = new SCORM12Adapter(api);
  });

  it('calls LMSInitialize on init', async () => {
    await adapter.init();
    expect(api.LMSInitialize).toHaveBeenCalledWith('');
  });

  it('reads suspend_data on init', async () => {
    const state: SavedState = {
      b: 3,
      v: [0, 1, 2, 3],
      q: { '2': 80 },
      d: 100,
    };
    (api.LMSGetValue as any).mockImplementation((key: string) =>
      key === 'cmi.suspend_data' ? JSON.stringify(state) : ''
    );
    await adapter.init();
    expect(adapter.getState()).toEqual(state);
  });

  it('returns null state when no suspend_data', async () => {
    await adapter.init();
    expect(adapter.getState()).toBeNull();
  });

  it('returns null state for corrupted suspend_data', async () => {
    (api.LMSGetValue as any).mockReturnValue('{broken');
    await adapter.init();
    expect(adapter.getState()).toBeNull();
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
    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.suspend_data',
      JSON.stringify(state)
    );
  });

  describe('suspend_data size guard', () => {
    it('warns once when serialized state exceeds 4096 chars', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      const big = { padding: 'x'.repeat(4200) };
      const state: SavedState = { b: 0, v: [], q: {}, d: 0, u: { big } };
      adapter.saveState(state);
      adapter.saveState(state);
      await flush();
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0][0]).toMatch(/SCORM 1\.2 cmi\.suspend_data 4096/);
      warn.mockRestore();
    });

    it('does not warn for state under the limit', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      adapter.saveState({ b: 0, v: [0], q: {}, d: 0 });
      await flush();
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    it('still writes the oversize value to the LMS', async () => {
      vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      const state: SavedState = {
        b: 0,
        v: [],
        q: {},
        d: 0,
        u: { big: 'y'.repeat(4200) },
      };
      adapter.saveState(state);
      await flush();
      expect(api.LMSSetValue).toHaveBeenCalledWith(
        'cmi.suspend_data',
        JSON.stringify(state)
      );
    });
  });

  it('sets score with raw, min, max via queue', async () => {
    adapter.setScore(85);
    await flush();
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '85');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.min', '0');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.max', '100');
  });

  describe('lesson_status reconciliation', () => {
    it('sets incomplete when completion is incomplete', async () => {
      adapter.setCompletionStatus('incomplete');
      await flush();
      expect(api.LMSSetValue).toHaveBeenCalledWith(
        'cmi.core.lesson_status',
        'incomplete'
      );
    });

    it('sets completed when completion is complete', async () => {
      adapter.setCompletionStatus('complete');
      await flush();
      expect(api.LMSSetValue).toHaveBeenCalledWith(
        'cmi.core.lesson_status',
        'completed'
      );
    });

    it('success status takes priority over completion', async () => {
      adapter.setCompletionStatus('complete');
      adapter.setSuccessStatus('passed');
      await flush();
      const calls = (api.LMSSetValue as any).mock.calls.filter(
        (c: string[]) => c[0] === 'cmi.core.lesson_status'
      );
      expect(calls[calls.length - 1][1]).toBe('passed');
    });

    it('failed status takes priority over completion', async () => {
      adapter.setCompletionStatus('complete');
      adapter.setSuccessStatus('failed');
      await flush();
      const calls = (api.LMSSetValue as any).mock.calls.filter(
        (c: string[]) => c[0] === 'cmi.core.lesson_status'
      );
      expect(calls[calls.length - 1][1]).toBe('failed');
    });

    it('success still takes priority after completion update', async () => {
      adapter.setSuccessStatus('passed');
      adapter.setCompletionStatus('incomplete');
      await flush();
      const calls = (api.LMSSetValue as any).mock.calls.filter(
        (c: string[]) => c[0] === 'cmi.core.lesson_status'
      );
      // Success status still takes priority
      expect(calls[calls.length - 1][1]).toBe('passed');
    });
  });

  it('sets duration in HHHH:MM:SS format via queue', async () => {
    adapter.setDuration(3661);
    await flush();
    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.session_time',
      '0001:01:01.00'
    );
  });

  it('commits via LMSCommit through queue', async () => {
    adapter.commit();
    await flush();
    expect(api.LMSCommit).toHaveBeenCalledWith('');
  });

  it('terminate drains queue then commits and finishes synchronously', () => {
    // Enqueue some operations
    adapter.setScore(90);
    adapter.setDuration(100);

    // Terminate should drain the queue, then commit + finish
    adapter.terminate();

    // Score and duration should have been flushed
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '90');
    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.session_time',
      '0000:01:40.00'
    );
    // Commit and Finish called synchronously
    expect(api.LMSCommit).toHaveBeenCalledWith('');
    expect(api.LMSFinish).toHaveBeenCalledWith('');
  });

  it('terminate is idempotent', () => {
    adapter.terminate();
    adapter.terminate();
    expect(api.LMSFinish).toHaveBeenCalledTimes(1);
  });

  it('operations are queued sequentially', async () => {
    const order: string[] = [];
    (api.LMSSetValue as any).mockImplementation(
      (key: string, _value: string) => {
        order.push(key);
        return 'true';
      }
    );

    adapter.saveState({ b: 0, v: [], q: {}, d: 0 });
    adapter.setScore(85);

    await flush();

    // suspend_data should come before score fields
    const suspendIdx = order.indexOf('cmi.suspend_data');
    const scoreIdx = order.indexOf('cmi.core.score.raw');
    expect(suspendIdx).toBeLessThan(scoreIdx);
  });

  it('retries on failed LMSSetValue via queue', async () => {
    let callCount = 0;
    (api.LMSSetValue as any).mockImplementation(() => {
      callCount++;
      return callCount >= 3 ? 'true' : 'false';
    });

    adapter.setScore(85);
    // Allow async retries to complete
    await new Promise((r) => setTimeout(r, 1000));
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  describe('reportInteraction', () => {
    function setValuesFor(prefix: string): Record<string, string> {
      const result: Record<string, string> = {};
      for (const call of (api.LMSSetValue as any).mock.calls as Array<[string, string]>) {
        if (call[0].startsWith(prefix)) result[call[0]] = call[1];
      }
      return result;
    }

    it('writes choice interaction with student_response and HH:MM:SS time', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.id']).toBe('q1');
      expect(v['cmi.interactions.0.type']).toBe('choice');
      expect(v['cmi.interactions.0.student_response']).toBe('a[,]b');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('a');
      expect(v['cmi.interactions.0.result']).toBe('wrong');
      expect(v['cmi.interactions.0.time']).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('maps long-fill-in to fill-in (SCORM 1.2 has no long-fill-in type)', async () => {
      adapter.reportInteraction(
        'lf1',
        { type: 'long-fill-in', response: 'a long answer', correct: ['a long answer'] },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('fill-in');
    });

    it('maps other to fill-in', async () => {
      adapter.reportInteraction(
        'o1',
        { type: 'other', response: 'x', correct: 'x' },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('fill-in');
    });

    it('writes result=correct for correct answers', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'true-false', response: true, correct: true },
        true
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.result']).toBe('correct');
    });

    it('omits correct_responses and result when not provided', async () => {
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
  });
});
