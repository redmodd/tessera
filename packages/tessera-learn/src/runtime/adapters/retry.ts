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

/** Default attempt count for LMS retry loops (one initial + two retries). */
export const RETRY_ATTEMPTS = 3;

/**
 * Exponential backoff in milliseconds for the Nth retry attempt
 * (0-indexed): 100, 200, 400, 800, …
 */
export function backoffMs(attempt: number): number {
  return 100 * Math.pow(2, attempt);
}

/**
 * SCORM `LMSSetValue` / `SetValue` semantics: the API returns `"true"` /
 * `"false"` strings, but some implementations also return the boolean form.
 * Anything other than a literal `false` / `"false"` is treated as success.
 */
function lmsCallSucceeded(result: unknown): boolean {
  return result !== false && result !== 'false';
}

/** Read `LMSGetLastError` / `GetLastError` defensively so it can never throw. */
function readLastErrorCode(reporter: LMSErrorReporter | undefined): string {
  if (!reporter) return '';
  try { return reporter.code(); } catch { return ''; }
}

/**
 * One-line warning emitted when a queued or retried LMS call gives up.
 * Pattern matches what production triage already greps for.
 */
function logRetryGiveUp(
  errorReporter: LMSErrorReporter | undefined,
  lastErrCode: string,
  context: string | undefined
): void {
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
  maxRetries = RETRY_ATTEMPTS,
  errorReporter?: LMSErrorReporter,
  context?: string
): Promise<boolean> {
  let lastErrCode = '';
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      if (lmsCallSucceeded(fn())) return true;
    } catch {
      // API call threw — treat as failure
    }
    lastErrCode = readLastErrorCode(errorReporter);
    if (attempt < maxRetries - 1) {
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
    }
  }
  logRetryGiveUp(errorReporter, lastErrCode, context);
  return false;
}

/**
 * Synchronous single-attempt LMS call. Used during page unload
 * where async retries cannot run.
 */
export function callSync(fn: () => any): boolean {
  try {
    return lmsCallSucceeded(fn());
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

    while (this.#queue.length > 0) {
      if (this.#aborted) {
        this.#flushing = false;
        return;
      }

      const entry = this.#queue.shift()!;
      let succeeded = false;
      let lastErrCode = '';

      for (let attempt = 0; attempt < RETRY_ATTEMPTS; attempt++) {
        let ok = false;
        try {
          ok = lmsCallSucceeded(entry.fn());
        } catch {
          // API call threw — treat as failure
        }
        if (ok) {
          succeeded = true;
          break;
        }
        lastErrCode = readLastErrorCode(this.errorReporter);
        if (attempt < RETRY_ATTEMPTS - 1) {
          // The next attempt is gated on a backoff timer that won't fire
          // during page unload. Mark in-flight so drainSync can re-run
          // the entry synchronously if it interrupts here.
          this.#inFlight = entry;
          await new Promise((r) => setTimeout(r, backoffMs(attempt)));
          this.#inFlight = null;
          if (this.#aborted) {
            this.#flushing = false;
            return;
          }
        }
      }

      if (!succeeded) {
        logRetryGiveUp(this.errorReporter, lastErrCode, entry.context);
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
