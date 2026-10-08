/**
 * Surfaces LMSGetLastError / LMSGetErrorString / LMSGetDiagnostic so failure
 * logs can name the cause instead of a generic "LMS call failed". SCORM
 * Cloud uses the diagnostic to name the offending data-model element.
 */
export interface LMSErrorReporter {
  code(): unknown;
  message(code: string): string;
  diagnostic?(code: string): string;
}

/** Default attempt count for LMS retry loops (one initial + two retries). */
export const RETRY_ATTEMPTS = 3;

/** Exponential backoff (0-indexed): 100, 200, 400, … ms. */
export function backoffMs(attempt: number): number {
  return 100 * Math.pow(2, attempt);
}

// SCORM SetValue may return string "false" or boolean false; everything else is success.
export function lmsCallSucceeded(result: unknown): boolean {
  return result !== false && result !== 'false';
}

function readLastErrorCode(reporter: LMSErrorReporter | undefined): string {
  if (!reporter) return '';
  try {
    return String(reporter.code() ?? '');
  } catch {
    return '';
  }
}

const PERMANENT_LMS_ERRORS = new Set(
  `132 133 142 143 201 202 203 301 351
   401 402 403 404 405 406 407 408`.split(/\s+/),
);

type CallContext = string | (() => string) | undefined;

function formatContext(context: CallContext): string {
  const resolved = typeof context === 'function' ? context() : context;
  return resolved ? ` [${resolved}]` : '';
}

function formatLMSErrorDetail(
  errorReporter: LMSErrorReporter | undefined,
  code: string,
): string {
  if (!errorReporter || !code || code === '0') return '';
  let msg = '';
  let diag = '';
  try {
    msg = errorReporter.message(code);
  } catch {}
  try {
    diag = errorReporter.diagnostic?.(code) ?? '';
  } catch {}
  let detail = ` (LMS error ${code}`;
  if (msg) detail += `: ${msg}`;
  if (diag && diag !== msg) detail += ` — ${diag}`;
  detail += ')';
  return detail;
}

/** Sync call that warns with the LMS error code on failure (terminate-path). */
export function callSyncOrWarn(
  fn: () => unknown,
  context: string,
  errorReporter?: LMSErrorReporter,
): boolean {
  let ok: boolean;
  try {
    ok = lmsCallSucceeded(fn());
  } catch (err) {
    console.warn(`Tessera: LMS call threw [${context}] during terminate`, err);
    return false;
  }
  if (!ok) {
    const code = readLastErrorCode(errorReporter);
    console.warn(
      `Tessera: LMS call failed [${context}] during terminate${formatLMSErrorDetail(errorReporter, code)}`,
    );
  }
  return ok;
}

/**
 * Retry wrapper for LMS API calls.
 * Retries up to maxRetries times with exponential backoff, or stops after
 * one attempt when the LMS error code marks a permanent rejection.
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
  fn: () => unknown,
  maxRetries = RETRY_ATTEMPTS,
  errorReporter?: LMSErrorReporter,
  context?: string,
): Promise<boolean> {
  return (await retryLoop(fn, maxRetries, errorReporter, context)) === 'ok';
}

// `aborted` skips the give-up warning that `failed` logs.
type RetryOutcome = 'ok' | 'failed' | 'rejected' | 'aborted';

interface RetryHooks {
  onBackoff(): void;
  /** Return false to abandon the retry loop. */
  onResume(): boolean;
}

async function retryLoop(
  fn: () => unknown,
  maxRetries: number,
  errorReporter: LMSErrorReporter | undefined,
  context: CallContext,
  hooks?: RetryHooks,
): Promise<RetryOutcome> {
  let lastErrCode = '';
  let threw = false;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    threw = false;
    try {
      if (lmsCallSucceeded(fn())) return 'ok';
    } catch (err) {
      threw = true;
      lastError = err;
    }
    lastErrCode = readLastErrorCode(errorReporter);
    if (!threw && PERMANENT_LMS_ERRORS.has(lastErrCode)) {
      console.warn(
        `Tessera: LMS rejected the call${formatContext(context)}${formatLMSErrorDetail(errorReporter, lastErrCode)}, not retrying`,
      );
      return 'rejected';
    }
    if (attempt < maxRetries - 1) {
      hooks?.onBackoff();
      await new Promise((r) => setTimeout(r, backoffMs(attempt)));
      if (hooks && !hooks.onResume()) return 'aborted';
    }
  }
  if (threw) {
    console.warn(
      `Tessera: LMS call threw${formatContext(context)} on final retry`,
      lastError,
    );
  }
  console.warn(
    `Tessera: LMS call failed after retries${formatContext(context)}${formatLMSErrorDetail(errorReporter, lastErrCode)}, continuing without persistence`,
  );
  return 'failed';
}

/**
 * Synchronous single-attempt LMS call. Used during page unload
 * where async retries cannot run.
 */
export function callSync(fn: () => unknown): boolean {
  try {
    return lmsCallSucceeded(fn());
  } catch {
    return false;
  }
}

interface QueueEntry {
  fn: () => unknown;
  context?: CallContext;
}

/**
 * Sequential write queue for LMS operations.
 * Enqueues operations and flushes them sequentially with retry.
 * An operation the LMS rejects with a permanent error is logged and dropped
 * so it cannot block the writes queued behind it. Any other failure stops
 * the queue and is retried on the next flush trigger.
 */
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
  enqueue(fn: () => unknown, context?: CallContext): void {
    this.#queue.push({ fn, context });
    if (!this.#flushing) {
      void this.#flush();
    }
  }

  /**
   * Flush the queue sequentially. An operation the LMS rejects with a
   * permanent error is dropped after one attempt. Any other failure is
   * re-inserted at the front after retries and the flush stops, so the
   * next trigger (or drainSync) runs it again.
   *
   * `#inFlight` is marked *only* while awaiting a backoff: drainSync re-runs
   * an in-flight entry synchronously, which is only safe when the current
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
      const outcome = await retryLoop(
        entry.fn,
        RETRY_ATTEMPTS,
        this.errorReporter,
        entry.context,
        {
          // The next attempt is gated on a backoff timer that won't fire
          // during page unload; drainSync re-runs the entry instead.
          onBackoff: () => {
            this.#inFlight = entry;
          },
          onResume: () => {
            this.#inFlight = null;
            return !this.#aborted;
          },
        },
      );

      // Aborted: drainSync already re-ran this entry synchronously.
      if (outcome === 'aborted') {
        this.#flushing = false;
        return;
      }
      if (outcome === 'failed') {
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
      // The async flush's retryLoop was suspended at a setTimeout backoff
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
