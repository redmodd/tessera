import { describe, it, expect, vi } from 'vitest';
import {
  withRetry,
  callSync,
  WriteQueue,
} from '../src/runtime/adapters/retry.js';
import { flush, useFakeTimers } from './helpers.js';

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
    const fn = vi.fn().mockReturnValueOnce('false').mockReturnValueOnce('true');
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
      expect.stringContaining('LMS call failed after retries'),
    );
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
      }),
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

    await flush();
    expect(order).toEqual([1, 2, 3]);
    expect(queue.pending).toBe(0);
  });

  it('drops a write the LMS rejects with a data-model error and flushes the rest', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];
    let code = '0';

    const queue = new WriteQueue();
    queue.errorReporter = { code: () => code, message: () => '' };

    queue.enqueue(() => {
      calls.push('a');
      return 'true';
    });
    queue.enqueue(() => {
      calls.push('b');
      code = '351';
      return 'false';
    }, 'cmi.interactions.1.id');
    queue.enqueue(() => {
      calls.push('c');
      code = '0';
      return 'true';
    });

    await flush();

    expect(calls).toEqual(['a', 'b', 'c']);
    expect(queue.pending).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('[cmi.interactions.1.id] (LMS error 351'),
    );
  });

  it('keeps a write that fails with a general error and retries it on the next trigger', async () => {
    useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];
    let failing = true;

    const queue = new WriteQueue();
    queue.errorReporter = { code: () => '101', message: () => '' };

    queue.enqueue(() => {
      calls.push('b');
      return failing ? 'false' : 'true';
    }, 'cmi.completion_status');
    queue.enqueue(() => {
      calls.push('c');
      return 'true';
    });

    await vi.runAllTimersAsync();

    expect(calls).toEqual(['b', 'b', 'b']);
    expect(queue.pending).toBe(2);

    failing = false;
    calls.length = 0;
    queue.enqueue(() => {
      calls.push('d');
      return 'true';
    });

    await vi.runAllTimersAsync();

    expect(calls).toEqual(['b', 'c', 'd']);
    expect(queue.pending).toBe(0);
  });

  it('drops a write the LMS rejects with a numeric error code', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];

    const queue = new WriteQueue();
    queue.errorReporter = { code: () => 351, message: () => '' };

    queue.enqueue(() => {
      calls.push('b');
      return 'false';
    }, 'cmi.interactions.0.id');

    await flush();

    expect(calls).toEqual(['b']);
    expect(queue.pending).toBe(0);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('(LMS error 351'),
    );
  });

  it.each([
    ['a commit failure reported as a numeric 391', 391],
    ['a code outside the SCORM error tables', '250'],
  ])('keeps a write that fails with %s', async (_, code) => {
    useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];

    const queue = new WriteQueue();
    queue.errorReporter = { code: () => code, message: () => '' };

    queue.enqueue(() => {
      calls.push('b');
      return 'false';
    });

    await vi.runAllTimersAsync();

    expect(calls).toEqual(['b', 'b', 'b']);
    expect(queue.pending).toBe(1);
  });

  it('drainSync runs a write kept after a general error', async () => {
    useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const calls: string[] = [];

    const queue = new WriteQueue();
    queue.errorReporter = { code: () => '101', message: () => '' };

    queue.enqueue(() => {
      calls.push('b');
      return calls.length > 3 ? 'true' : 'false';
    });

    await vi.runAllTimersAsync();
    expect(queue.pending).toBe(1);

    queue.drainSync();

    expect(calls).toEqual(['b', 'b', 'b', 'b']);
    expect(queue.pending).toBe(0);
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
    await flush();
    expect(calls).toEqual(['a']);

    queue.drainSync();
    // drainSync sees the entry is in-flight (mid-backoff) and retries it
    // synchronously. This time it succeeds.
    expect(calls).toEqual(['a', 'a']);
    expect(queue.pending).toBe(0);
  });
});
