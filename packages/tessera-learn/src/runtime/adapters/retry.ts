/**
 * Optional callback that surfaces the LMS's last-error code/message after
 * a failed call, so warning logs can name the actual cause instead of a
 * generic "LMS call failed".
 */
export interface LMSErrorReporter {
  /** Last error from `LMSGetLastError` / `GetLastError`. */
  code(): string;
  /** Human-readable message from `LMSGetErrorString` / `GetErrorString`. */
  message(code: string): string;
}

/**
 * Retry wrapper for LMS API calls.
 * Retries up to maxRetries times with exponential backoff.
 * Returns true if the call eventually succeeded, false otherwise.
 *
 * If `errorReporter` is provided, the SCORM `GetLastError` /
 * `GetErrorString` pair is read after each failure and surfaced in the
 * final warning so production triage can name the real failure
 * (e.g., "201 Invalid argument error" or "405 Incorrect Data Type").
 *
 * Note: During page unload (pagehide/beforeunload), only the first
 * synchronous attempt will execute — async retries with setTimeout
 * won't run because the page is being torn down. This is acceptable
 * for SCORM adapters where the underlying API calls are synchronous.
 */
export async function withRetry(
  fn: () => any,
  maxRetries = 3,
  errorReporter?: LMSErrorReporter,
  context?: string
): Promise<boolean> {
  let lastErrCode = '';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = fn();
      if (result !== false && result !== 'false') return true;
    } catch {
      // API call threw — treat as failure
    }
    if (errorReporter) {
      try { lastErrCode = errorReporter.code(); } catch {}
    }
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
    }
  }
  let detail = '';
  if (errorReporter && lastErrCode && lastErrCode !== '0') {
    try {
      const msg = errorReporter.message(lastErrCode);
      detail = ` (LMS error ${lastErrCode}${msg ? `: ${msg}` : ''})`;
    } catch {}
  }
  const ctx = context ? ` [${context}]` : '';
  console.warn(
    `Tessera: LMS call failed after retries${ctx}${detail}, continuing without persistence`
  );
  return false;
}

/**
 * Synchronous single-attempt LMS call. Used during page unload
 * where async retries cannot run.
 */
export function callSync(fn: () => any): boolean {
  try {
    const result = fn();
    return result !== false && result !== 'false';
  } catch {
    return false;
  }
}

/**
 * Sequential write queue for LMS operations.
 * Enqueues operations and flushes them sequentially with retry.
 * If an operation fails after retries, the queue stops and retries
 * the failed operation on the next flush trigger.
 */
interface QueueEntry {
  fn: () => any;
  context?: string;
}

export class WriteQueue {
  #queue: QueueEntry[] = [];
  #flushing = false;
  #aborted = false;
  /**
   * The entry that the async flush has shifted off the queue and is
   * currently awaiting a retry on. drainSync needs to know about this so
   * it can re-run the entry synchronously — otherwise an entry caught
   * mid-backoff at unload time vanishes silently.
   */
  #inFlight: QueueEntry | null = null;

  errorReporter?: LMSErrorReporter;

  /**
   * Enqueue an operation and trigger a flush.
   */
  enqueue(fn: () => any, context?: string): void {
    this.#queue.push({ fn, context });
    if (!this.#flushing) {
      this.#flush();
    }
  }

  /**
   * Flush the queue sequentially. If an operation fails after retries,
   * re-insert it at the front and stop — retry on next trigger.
   *
   * Retry is inlined (not delegated to `withRetry`) so we can mark
   * `#inFlight` *only* while awaiting a backoff. drainSync re-runs an
   * in-flight entry synchronously, which is only safe when the current
   * attempt has failed and the next attempt is what we're waiting on.
   */
  async #flush(): Promise<void> {
    if (this.#flushing) return;
    this.#flushing = true;
    this.#aborted = false;

    const MAX_ATTEMPTS = 3;

    while (this.#queue.length > 0) {
      if (this.#aborted) {
        this.#flushing = false;
        return;
      }

      const entry = this.#queue.shift()!;
      let succeeded = false;
      let lastErrCode = '';

      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        let ok = false;
        try {
          const result = entry.fn();
          ok = result !== false && result !== 'false';
        } catch {
          // API call threw — treat as failure
        }
        if (ok) {
          succeeded = true;
          break;
        }
        if (this.errorReporter) {
          try { lastErrCode = this.errorReporter.code(); } catch {}
        }
        if (attempt < MAX_ATTEMPTS - 1) {
          // The next attempt is gated on a backoff timer that won't fire
          // during page unload. Mark in-flight so drainSync can re-run
          // the entry synchronously if it interrupts here.
          this.#inFlight = entry;
          await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt)));
          this.#inFlight = null;
          if (this.#aborted) {
            this.#flushing = false;
            return;
          }
        }
      }

      if (!succeeded) {
        let detail = '';
        if (this.errorReporter && lastErrCode && lastErrCode !== '0') {
          try {
            const msg = this.errorReporter.message(lastErrCode);
            detail = ` (LMS error ${lastErrCode}${msg ? `: ${msg}` : ''})`;
          } catch {}
        }
        const ctx = entry.context ? ` [${entry.context}]` : '';
        console.warn(
          `Tessera: LMS call failed after retries${ctx}${detail}, continuing without persistence`
        );
        this.#queue.unshift(entry);
        this.#flushing = false;
        return;
      }
    }

    this.#flushing = false;
  }

  /**
   * Synchronously drain the queue (best-effort, single attempt each).
   * Used during page unload where async operations cannot complete.
   * Aborts any in-progress async flush and re-runs its in-flight entry
   * synchronously (the awaited backoff timer won't fire during unload).
   */
  drainSync(): void {
    this.#aborted = true;
    this.#flushing = false;
    if (this.#inFlight) {
      // The async flush's withRetry was suspended at a setTimeout backoff
      // that won't fire before the page tears down. Run the entry once
      // synchronously so its write isn't lost. The async flush will see
      // the abort flag when (if) it ever resumes and exit cleanly.
      const entry = this.#inFlight;
      this.#inFlight = null;
      callSync(entry.fn);
    }
    while (this.#queue.length > 0) {
      const entry = this.#queue.shift()!;
      callSync(entry.fn);
    }
  }

  get pending(): number {
    return this.#queue.length;
  }
}

/**
 * Walk the window.opener and window.parent chains looking for an LMS API object.
 * Shared by SCORM 1.2 (property "API") and SCORM 2004 (property "API_1484_11").
 * Returns null if not found within 10 levels or a cross-origin boundary is hit.
 */
export function findLMSAPI(propName: string): unknown {
  function scan(win: Window): unknown {
    for (let i = 0; i < 10; i++) {
      try {
        const value = (win as unknown as Record<string, unknown>)[propName];
        if (value) return value;
      } catch {
        // Cross-origin frame — stop
        return null;
      }
      if (win.parent === win) break;
      try {
        win = win.parent;
      } catch {
        // Cross-origin frame — stop
        break;
      }
    }
    return null;
  }

  // Check window.opener chain first (popup launch pattern)
  if (window.opener) {
    const api = scan(window.opener as Window);
    if (api) return api;
  }

  // Check window.parent chain (iframe launch pattern)
  return scan(window);
}

/**
 * Format integer seconds as SCORM 1.2 `CMITimespan` (HHHH:MM:SS.SS).
 *
 * `DurationTracker.sessionSeconds` always feeds integer seconds via
 * `Math.floor`, so the centisecond field is always `.00`. The format
 * still includes it because `CMITimespan` is defined that way and some
 * older LMS importers reject the bare HHHH:MM:SS form.
 */
export function formatHHMMSS(totalSeconds: number): string {
  const whole = Math.floor(totalSeconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  const hh = String(hours).padStart(4, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}.00`;
}

/**
 * Format seconds as ISO 8601 duration: PT1H30M45S
 */
export function formatISO8601Duration(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  let result = 'PT';
  if (hours > 0) result += `${hours}H`;
  if (minutes > 0) result += `${minutes}M`;
  if (seconds > 0 || result === 'PT') result += `${seconds}S`;
  return result;
}
