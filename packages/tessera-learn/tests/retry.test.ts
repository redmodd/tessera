import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  callSync,
  WriteQueue,
  formatHHMMSS,
  formatISO8601Duration,
  formatISO8601Timestamp,
  formatReal107,
} from '../src/runtime/adapters/retry.js';

describe('formatISO8601Timestamp', () => {
  it('emits zone-free, second-resolution dateTime per SCORM 2004 §5.3.3', () => {
    const d = new Date('2026-05-12T00:28:37.910Z');
    // No "Z", no fractional. Strict 2004 validators reject either.
    expect(formatISO8601Timestamp(d)).toBe('2026-05-12T00:28:37');
  });

  it('uses UTC components, not local TZ', () => {
    const d = new Date(Date.UTC(2026, 4, 12, 0, 28, 37));
    expect(formatISO8601Timestamp(d)).toBe('2026-05-12T00:28:37');
  });

  it('zero-pads single-digit fields', () => {
    const d = new Date(Date.UTC(2026, 0, 3, 4, 5, 6));
    expect(formatISO8601Timestamp(d)).toBe('2026-01-03T04:05:06');
  });
});

describe('formatReal107', () => {
  it('keeps clean decimals unchanged', () => {
    expect(formatReal107(0.85)).toBe('0.85');
    expect(formatReal107(85)).toBe('85');
    expect(formatReal107(0)).toBe('0');
    expect(formatReal107(1)).toBe('1');
  });

  it('truncates beyond 7 fractional digits', () => {
    expect(formatReal107(1 / 3)).toBe('0.3333333');
    expect(formatReal107(2 / 3)).toBe('0.6666667');
    expect(formatReal107((7 / 11) * 100)).toBe('63.6363636');
  });

  it('drops trailing zeros (no padded 0.8500000)', () => {
    expect(formatReal107(0.5)).toBe('0.5');
    expect(formatReal107(0.75)).toBe('0.75');
  });

  it('returns "0" for non-finite input', () => {
    expect(formatReal107(NaN)).toBe('0');
    expect(formatReal107(Infinity)).toBe('0');
  });
});

describe('withRetry', () => {
  it('returns true on first success', async () => {
    const fn = vi.fn().mockReturnValue('true');
    const result = await withRetry(fn, 3);
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns true for any truthy non-"false" result', async () => {
    expect(await withRetry(() => 'true')).toBe(true);
    expect(await withRetry(() => 1)).toBe(true);
    expect(await withRetry(() => 'ok')).toBe(true);
    expect(await withRetry(() => undefined)).toBe(true);
    expect(await withRetry(() => null)).toBe(true);
  });

  it('retries on false return value', async () => {
    const fn = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(false)
      .mockReturnValueOnce('true');
    const result = await withRetry(fn, 3);
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries on "false" string return value', async () => {
    const fn = vi
      .fn()
      .mockReturnValueOnce('false')
      .mockReturnValueOnce('true');
    const result = await withRetry(fn, 3);
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('retries on thrown error', async () => {
    const fn = vi
      .fn()
      .mockImplementationOnce(() => {
        throw new Error('fail');
      })
      .mockReturnValueOnce('true');
    const result = await withRetry(fn, 3);
    expect(result).toBe(true);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('returns false after all retries exhausted', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fn = vi.fn().mockReturnValue(false);
    const result = await withRetry(fn, 3);
    expect(result).toBe(false);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('LMS call failed after retries')
    );
    warnSpy.mockRestore();
  });

  it('logs warning on exhausted retries', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await withRetry(() => false, 1);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe('callSync', () => {
  it('returns true on success', () => {
    expect(callSync(() => 'true')).toBe(true);
  });

  it('returns false on false return', () => {
    expect(callSync(() => false)).toBe(false);
  });

  it('returns false on "false" string', () => {
    expect(callSync(() => 'false')).toBe(false);
  });

  it('returns false on thrown error', () => {
    expect(
      callSync(() => {
        throw new Error('fail');
      })
    ).toBe(false);
  });
});

describe('WriteQueue', () => {
  it('flushes operations sequentially', async () => {
    const order: number[] = [];
    const queue = new WriteQueue();

    queue.enqueue(() => {
      order.push(1);
      return 'true';
    });
    queue.enqueue(() => {
      order.push(2);
      return 'true';
    });
    queue.enqueue(() => {
      order.push(3);
      return 'true';
    });

    // Let async flush complete
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual([1, 2, 3]);
    expect(queue.pending).toBe(0);
  });

  it('stops on failure and retries on next trigger', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];
    let failFirst = true;

    const queue = new WriteQueue();

    queue.enqueue(() => {
      calls.push('a');
      return 'true';
    });
    queue.enqueue(() => {
      calls.push('b-attempt');
      if (failFirst) return false; // fail all retries
      return 'true';
    });
    queue.enqueue(() => {
      calls.push('c');
      return 'true';
    });

    // Let async flush complete (with retries)
    await new Promise((r) => setTimeout(r, 2000));

    // 'a' succeeded, 'b' failed after retries, 'c' never ran
    expect(calls.filter((c) => c === 'a').length).toBe(1);
    expect(calls.filter((c) => c === 'b-attempt').length).toBe(3); // 3 retry attempts
    expect(calls.filter((c) => c === 'c').length).toBe(0);
    expect(queue.pending).toBe(2); // b and c still pending

    // Now let b succeed on next trigger
    failFirst = false;
    calls.length = 0;
    queue.enqueue(() => {
      calls.push('d');
      return 'true';
    });

    await new Promise((r) => setTimeout(r, 200));

    // b, c, d should all succeed now
    expect(calls).toContain('b-attempt');
    expect(calls).toContain('c');
    expect(calls).toContain('d');
    expect(queue.pending).toBe(0);

    warnSpy.mockRestore();
  });

  it('drainSync executes all pending operations synchronously', () => {
    const calls: number[] = [];
    const queue = new WriteQueue();

    // Add items without letting async flush run
    queue.enqueue(() => {
      calls.push(1);
      return 'true';
    });
    queue.enqueue(() => {
      calls.push(2);
      return 'true';
    });

    // Drain synchronously (simulates page unload)
    queue.drainSync();

    expect(calls).toEqual([1, 2]);
    expect(queue.pending).toBe(0);
  });

  it('drainSync continues past failures', () => {
    const calls: string[] = [];
    const queue = new WriteQueue();

    queue.enqueue(() => {
      calls.push('a');
      return false; // fails — async flush is now mid-backoff
    });
    queue.enqueue(() => {
      calls.push('b');
      return 'true';
    });

    queue.drainSync();

    // 'a' is retried by drainSync (it was caught mid-backoff, which won't
    // fire during unload — so we re-run it sync). Then 'b' runs.
    expect(calls).toEqual(['a', 'a', 'b']);
    expect(queue.pending).toBe(0);
  });

  it('drainSync re-runs the in-flight entry caught mid-backoff', async () => {
    const calls: string[] = [];
    const queue = new WriteQueue();

    let firstAttempt = true;
    queue.enqueue(() => {
      calls.push('a');
      if (firstAttempt) {
        firstAttempt = false;
        return false; // fail first attempt — async flush sleeps 100ms
      }
      return 'true';
    });

    // Let the first attempt run and the queue settle into backoff.
    await new Promise((r) => setTimeout(r, 10));
    expect(calls).toEqual(['a']);

    queue.drainSync();
    // drainSync sees the entry is in-flight (mid-backoff) and retries it
    // synchronously. This time it succeeds.
    expect(calls).toEqual(['a', 'a']);
    expect(queue.pending).toBe(0);
  });
});

describe('formatHHMMSS', () => {
  it('formats 0 seconds', () => {
    expect(formatHHMMSS(0)).toBe('0000:00:00.00');
  });

  it('formats seconds only', () => {
    expect(formatHHMMSS(45)).toBe('0000:00:45.00');
  });

  it('formats minutes and seconds', () => {
    expect(formatHHMMSS(125)).toBe('0000:02:05.00');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatHHMMSS(3661)).toBe('0001:01:01.00');
  });

  it('formats large hour values', () => {
    expect(formatHHMMSS(36000)).toBe('0010:00:00.00');
  });
});

describe('formatISO8601Duration', () => {
  it('formats 0 seconds', () => {
    expect(formatISO8601Duration(0)).toBe('PT0S');
  });

  it('formats seconds only', () => {
    expect(formatISO8601Duration(45)).toBe('PT45S');
  });

  it('formats minutes and seconds', () => {
    expect(formatISO8601Duration(125)).toBe('PT2M5S');
  });

  it('formats hours, minutes, and seconds', () => {
    expect(formatISO8601Duration(3661)).toBe('PT1H1M1S');
  });

  it('formats hours only (no trailing zeros)', () => {
    expect(formatISO8601Duration(7200)).toBe('PT2H');
  });

  it('formats minutes only', () => {
    expect(formatISO8601Duration(300)).toBe('PT5M');
  });
});
