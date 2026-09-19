import { describe, it, expect, vi, beforeEach, type Mocked } from 'vitest';
import {
  SCORM12Adapter,
  type SCORM12API,
} from '../src/runtime/adapters/scorm12.js';
import type { SavedState } from '../src/runtime/persistence.js';
import { validateAgent } from '../src/runtime/xapi/validation.js';
import { flush, scorm12Api } from './helpers.js';

describe('SCORM12Adapter', () => {
  let api: Mocked<SCORM12API>;
  let adapter: SCORM12Adapter;

  beforeEach(() => {
    api = scorm12Api();
    adapter = new SCORM12Adapter(api);
  });

  // ---- lifecycle / init ----

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
    api.LMSGetValue.mockImplementation((key) =>
      key === 'cmi.suspend_data' ? JSON.stringify(state) : '',
    );
    await adapter.init();
    expect(adapter.getState()).toEqual(state);
  });

  it('returns null state when no suspend_data', async () => {
    await adapter.init();
    expect(adapter.getState()).toBeNull();
  });

  it('returns null state for corrupted suspend_data', async () => {
    api.LMSGetValue.mockReturnValue('{broken');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await adapter.init();
    expect(adapter.getState()).toBeNull();
    expect(
      warn.mock.calls.some((c) => /not valid JSON/.test(String(c[0]))),
    ).toBe(true);
    warn.mockRestore();
  });

  // ---- saveState / suspend_data ----

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
      JSON.stringify(state),
    );
  });

  it('writes cmi.core.lesson_location from SavedState.b on saveState', async () => {
    await adapter.init();
    adapter.saveState({ b: 4, v: [0, 1, 2, 3, 4], q: {}, d: 50 });
    await flush();
    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.lesson_location',
      '4',
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
      expect(warn.mock.calls[0][0]).toMatch(
        /SCORM 1\.2 cmi\.suspend_data 4096/,
      );
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
        JSON.stringify(state),
      );
    });
  });

  describe('LMS-supplied mastery_score', () => {
    async function masteryFrom(value: string) {
      api = scorm12Api({ 'cmi.student_data.mastery_score': value });
      adapter = new SCORM12Adapter(api);
      await adapter.init();
      return adapter.getMasteryScore();
    }

    it('scales cmi.student_data.mastery_score to [0, 1]', async () => {
      expect(await masteryFrom('60')).toBe(0.6);
      expect(await masteryFrom('0')).toBe(0);
      expect(await masteryFrom('100')).toBe(1);
    });

    it.each(['', ' ', 'abc', '-1', '101'])(
      'ignores mastery_score %j',
      async (value) => {
        expect(await masteryFrom(value)).toBeNull();
      },
    );

    it('ignores a mastery_score read that throws', async () => {
      api.LMSGetValue.mockImplementation((key) => {
        if (key === 'cmi.student_data.mastery_score') throw new Error('boom');
        return '';
      });
      await adapter.init();
      expect(adapter.getMasteryScore()).toBeNull();
    });
  });

  // ---- setScore ----

  it('sets score with raw, min, max via queue', async () => {
    adapter.setScore(85);
    await flush();
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.raw', '85');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.min', '0');
    expect(api.LMSSetValue).toHaveBeenCalledWith('cmi.core.score.max', '100');
  });

  it('rounds fractional scores to real(10,7) — no 16-digit decimal trips 405', async () => {
    await adapter.init();
    adapter.setScore((7 / 11) * 100);
    await flush();
    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.score.raw',
      '63.6363636',
    );
  });

  // ---- lesson_status ----

  describe('lesson_status reconciliation', () => {
    it('sets incomplete when completion is incomplete', async () => {
      adapter.setCompletionStatus('incomplete');
      await flush();
      expect(api.LMSSetValue).toHaveBeenCalledWith(
        'cmi.core.lesson_status',
        'incomplete',
      );
    });

    it('sets completed when completion is complete', async () => {
      adapter.setCompletionStatus('complete');
      await flush();
      expect(api.LMSSetValue).toHaveBeenCalledWith(
        'cmi.core.lesson_status',
        'completed',
      );
    });

    it('success status takes priority over completion', async () => {
      adapter.setCompletionStatus('complete');
      adapter.setSuccessStatus('passed');
      await flush();
      const calls = api.LMSSetValue.mock.calls.filter(
        ([k]) => k === 'cmi.core.lesson_status',
      );
      expect(calls.at(-1)?.[1]).toBe('passed');
    });

    it('failed status takes priority over completion', async () => {
      adapter.setCompletionStatus('complete');
      adapter.setSuccessStatus('failed');
      await flush();
      const calls = api.LMSSetValue.mock.calls.filter(
        ([k]) => k === 'cmi.core.lesson_status',
      );
      expect(calls.at(-1)?.[1]).toBe('failed');
    });

    it('success still takes priority after completion update', async () => {
      adapter.setSuccessStatus('passed');
      adapter.setCompletionStatus('incomplete');
      await flush();
      const calls = api.LMSSetValue.mock.calls.filter(
        ([k]) => k === 'cmi.core.lesson_status',
      );
      // Success status still takes priority
      expect(calls.at(-1)?.[1]).toBe('passed');
    });
  });

  // ---- duration / commit / terminate ----

  it('sets duration in HHHH:MM:SS format via queue', async () => {
    adapter.setDuration(3661);
    await flush();
    expect(api.LMSSetValue).toHaveBeenCalledWith(
      'cmi.core.session_time',
      '0001:01:01.00',
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
      '0000:01:40.00',
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

  // ---- queue ----

  it('operations are queued sequentially', async () => {
    const order: string[] = [];
    api.LMSSetValue.mockImplementation((key) => {
      order.push(key);
      return 'true';
    });

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
    api.LMSSetValue.mockImplementation(() => {
      callCount++;
      return callCount >= 3 ? 'true' : 'false';
    });

    adapter.setScore(85);
    // Allow async retries to complete
    await new Promise((r) => setTimeout(r, 1000));
    expect(callCount).toBeGreaterThanOrEqual(3);
  });

  // ---- interactions ----

  describe('reportInteraction', () => {
    function setValuesFor(prefix: string): Record<string, string> {
      const result: Record<string, string> = {};
      for (const call of api.LMSSetValue.mock.calls) {
        if (call[0].startsWith(prefix)) result[call[0]] = call[1];
      }
      return result;
    }

    it('writes choice interaction with student_response and HH:MM:SS time', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['a', 'b'], correct: ['a'] },
        false,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.id']).toBe('q1');
      expect(v['cmi.interactions.0.type']).toBe('choice');
      expect(v['cmi.interactions.0.student_response']).toBe('a,b');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('a');
      expect(v['cmi.interactions.0.result']).toBe('wrong');
      expect(v['cmi.interactions.0.time']).toMatch(/^\d{2}:\d{2}:\d{2}$/);
    });

    it('slugs non-alphanumeric choice identifiers (SCORM 1.2 CMIIdentifier)', async () => {
      adapter.reportInteraction(
        'q1',
        {
          type: 'choice',
          response: ['88 Earth days', 'Iron-rich dust'],
          correct: ['88 Earth days'],
        },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe(
        '88_Earth_days,Iron_rich_dust',
      );
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe(
        '88_Earth_days',
      );
    });

    it('encodes true-false as t/f per SCORM 1.2', async () => {
      adapter.reportInteraction(
        'tf1',
        { type: 'true-false', response: true, correct: false },
        false,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe('t');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('f');
    });

    it('uses plain . and , delimiters for matching pairs', async () => {
      adapter.reportInteraction(
        'm1',
        {
          type: 'matching',
          response: [
            ['Phobos', 'Mars'],
            ['Europa', 'Jupiter'],
          ],
          correct: [
            ['Phobos', 'Mars'],
            ['Europa', 'Jupiter'],
          ],
        },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe(
        'Phobos.Mars,Europa.Jupiter',
      );
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe(
        'Phobos.Mars,Europa.Jupiter',
      );
    });

    it('maps choice response/correct to option indexes when options is supplied', async () => {
      adapter.reportInteraction(
        'q1',
        {
          type: 'choice',
          response: ['speed-limit'],
          correct: ['speed-limit'],
          options: ['stop', 'yield', 'speed-limit', 'merge'],
        },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe('2');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('2');
    });

    it('maps matching pairs to indexes via optionPairs', async () => {
      adapter.reportInteraction(
        'm1',
        {
          type: 'matching',
          response: [['Phobos', 'Mars']],
          correct: [['Phobos', 'Mars']],
          optionPairs: {
            left: ['Phobos', 'Europa'],
            right: ['Mars', 'Jupiter'],
          },
        },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe('0.0');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('0.0');
    });

    it('falls back to slugging when options is not supplied', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'choice', response: ['speed-limit'], correct: ['speed-limit'] },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe('speed_limit');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe(
        'speed_limit',
      );
    });

    it('drops correct_responses for numeric ranges (SCORM 1.2 has no range pattern)', async () => {
      adapter.reportInteraction(
        'n1',
        { type: 'numeric', response: 22, correct: { min: 19, max: 25 } },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.student_response']).toBe('22');
      expect(
        v['cmi.interactions.0.correct_responses.0.pattern'],
      ).toBeUndefined();
      // result still tells the LMS pass/fail
      expect(v['cmi.interactions.0.result']).toBe('correct');
    });

    it('keeps numeric correct_responses when min == max (single value)', async () => {
      adapter.reportInteraction(
        'n2',
        { type: 'numeric', response: 7, correct: { min: 7, max: 7 } },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('7');
    });

    it('writes one pattern per fill-in alternative', async () => {
      adapter.reportInteraction(
        'fi1',
        { type: 'fill-in', response: 'blue', correct: ['blue', 'Blue'] },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('blue');
      expect(v['cmi.interactions.0.correct_responses.1.pattern']).toBe('Blue');
    });

    it('emits no case_matters prefix (SCORM 1.2 has no such syntax)', async () => {
      adapter.reportInteraction(
        'fi2',
        {
          type: 'fill-in',
          response: 'Paris',
          correct: ['Paris'],
          caseMatters: true,
        },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.correct_responses.0.pattern']).toBe('Paris');
    });

    it('maps long-fill-in to fill-in (SCORM 1.2 has no long-fill-in type)', async () => {
      adapter.reportInteraction(
        'lf1',
        {
          type: 'long-fill-in',
          response: 'a long answer',
          correct: ['a long answer'],
        },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('fill-in');
    });

    it('maps other to fill-in', async () => {
      adapter.reportInteraction(
        'o1',
        { type: 'other', response: 'x', correct: 'x' },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.type']).toBe('fill-in');
    });

    it('writes result=correct for correct answers', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'true-false', response: true, correct: true },
        true,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(v['cmi.interactions.0.result']).toBe('correct');
    });

    it('omits correct_responses and result when not provided', async () => {
      adapter.reportInteraction(
        'q1',
        { type: 'likert', response: 'agree' },
        null,
      );
      await flush();
      const v = setValuesFor('cmi.interactions.0');
      expect(
        v['cmi.interactions.0.correct_responses.0.pattern'],
      ).toBeUndefined();
      expect(v['cmi.interactions.0.result']).toBeUndefined();
    });
  });

  // ---- error logging (parity with cmi5) ----

  describe('error logging parity with cmi5', () => {
    it('warns with LMS error code + diagnostic when LMSInitialize fails', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      api.LMSInitialize.mockReturnValue('false');
      api.LMSGetLastError.mockReturnValue('101');
      api.LMSGetErrorString.mockReturnValue('General Exception');
      api.LMSGetDiagnostic.mockReturnValue('LMS unavailable');
      await adapter.init();
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toMatch(/Initialize/);
      expect(messages).toMatch(/101/);
      expect(messages).toMatch(/General Exception/);
      expect(messages).toMatch(/LMS unavailable/);
      expect(messages).toMatch(/error 301/);
      warn.mockRestore();
    });

    it('warns when cmi.interactions._count is non-numeric (would clobber prior records)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      api.LMSGetValue.mockImplementation((key) =>
        key === 'cmi.interactions._count' ? 'NaN' : '',
      );
      await adapter.init();
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toMatch(/cmi\.interactions\._count/);
      expect(messages).toMatch(/overwrite prior session records/);
      warn.mockRestore();
    });

    it('warns when LMSCommit fails during terminate', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      api.LMSCommit.mockReturnValue('false');
      api.LMSGetLastError.mockReturnValue('101');
      api.LMSGetErrorString.mockReturnValue('General Exception');
      adapter.terminate();
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toMatch(/Commit.*during terminate/);
      expect(messages).toMatch(/101/);
      warn.mockRestore();
    });

    it('warns when LMSFinish fails during terminate', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      api.LMSFinish.mockReturnValue('false');
      api.LMSGetLastError.mockReturnValue('101');
      api.LMSGetErrorString.mockReturnValue('General Exception');
      adapter.terminate();
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toMatch(/Terminate.*during terminate/);
      warn.mockRestore();
    });

    it('SetValue retry give-up names the cmi key and includes diagnostic', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      await adapter.init();
      api.LMSSetValue.mockReturnValue('false');
      api.LMSGetLastError.mockReturnValue('405');
      api.LMSGetErrorString.mockReturnValue('Incorrect Data Type');
      api.LMSGetDiagnostic.mockReturnValue(
        'student_response invalid CMIFeedback',
      );
      adapter.setScore(85);
      await new Promise((r) => setTimeout(r, 1000));
      const messages = warn.mock.calls.map((c) => String(c[0])).join('\n');
      expect(messages).toMatch(/cmi\.core\.score\.raw/);
      expect(messages).toMatch(/405/);
      expect(messages).toMatch(/Incorrect Data Type/);
      expect(messages).toMatch(/student_response invalid CMIFeedback/);
      warn.mockRestore();
    });
  });

  describe('deriveActor', () => {
    const activityId = 'https://example.com/courses/1';

    it('builds an Identified Agent from cmi.core.student_id / student_name', () => {
      const withLearner = new SCORM12Adapter(
        scorm12Api({
          'cmi.core.student_id': 'student-42',
          'cmi.core.student_name': 'Ada Lovelace',
        }),
      );
      const actor = withLearner.deriveActor(activityId);
      expect(actor).toEqual({
        account: { homePage: 'https://example.com', name: 'student-42' },
        name: 'Ada Lovelace',
        objectType: 'Agent',
      });
      expect(validateAgent(actor)).toBeNull();
    });

    it('honors an actorAccountHomePage override', () => {
      const withLearner = new SCORM12Adapter(
        scorm12Api({ 'cmi.core.student_id': 'sid' }),
      );
      expect(
        withLearner.deriveActor(activityId, 'https://lms.example.com')?.account
          ?.homePage,
      ).toBe('https://lms.example.com');
    });

    it('returns null when the LMS has no learner id', () => {
      expect(adapter.deriveActor(activityId)).toBeNull();
    });
  });
});
