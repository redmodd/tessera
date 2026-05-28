// Faithful LMS test doubles backed by scorm-again, which validates each write
// against the real CMI data model. The wrapper conforms to the adapter's
// SCORM12API / SCORM2004API shape and adds:
//  - errors: failures captured synchronously at each write/lifecycle call site.
//    GetLastError is latched and reset by the next successful call, so polling
//    it later is racy; reading it the instant a call returns captures the right
//    code. The retry queue re-runs a failing write, so assert on emptiness.
//  - log: every delegated call (1.2 interaction fields are write-only, so they
//    can only be verified via the log + empty errors, not read-back).
//  - dispose: terminates the instance so its unload handlers don't leak.
import { Scorm12API } from 'scorm-again/scorm12';
import { Scorm2004API } from 'scorm-again/scorm2004';
import type { SCORM12API } from '../../src/runtime/adapters/scorm12.js';
import type { SCORM2004API } from '../../src/runtime/adapters/scorm2004.js';

export interface CapturedError {
  key: string;
  code: string;
}

interface RealLms<TApi, TRaw> {
  /** Wrapped instance conforming to the adapter's expected API shape. */
  api: TApi;
  /** The underlying scorm-again instance, for read-back of readable elements. */
  raw: TRaw;
  /** Writes/lifecycle calls scorm-again rejected, captured at the call site. */
  errors: CapturedError[];
  /** Every delegated call: [method, ...args/value]. */
  log: string[][];
  dispose(): void;
}

export type RealLms12 = RealLms<SCORM12API, Scorm12API>;
export type RealLms2004 = RealLms<SCORM2004API, Scorm2004API>;

// autocommit/lmsCommitUrl off so nothing fires async or hits the network;
// logLevel NONE so scorm-again's own console logging can't trip the suites
// that assert on console.warn call counts.
const SETTINGS = {
  autocommit: false,
  lmsCommitUrl: undefined,
  logLevel: 'NONE',
} as const;

export function createReal12Lms(): RealLms12 {
  const raw = new Scorm12API({ ...SETTINGS });
  const errors: CapturedError[] = [];
  const log: string[][] = [];

  const capture = (key: string, ret: string) => {
    const code = raw.LMSGetLastError();
    if (ret !== 'true' || code !== '0') errors.push({ key, code });
  };

  const api: SCORM12API = {
    LMSInitialize: (s) => {
      const r = raw.LMSInitialize(s);
      log.push(['LMSInitialize', s]);
      capture('Initialize', r);
      return r;
    },
    LMSFinish: (s) => {
      const r = raw.LMSFinish(s);
      log.push(['LMSFinish', s]);
      capture('Finish', r);
      return r;
    },
    LMSGetValue: (k) => {
      const v = raw.LMSGetValue(k);
      log.push(['LMSGetValue', k, v]);
      return v;
    },
    LMSSetValue: (k, v) => {
      const r = raw.LMSSetValue(k, v);
      log.push(['LMSSetValue', k, v]);
      capture(k, r);
      return r;
    },
    LMSCommit: (s) => {
      const r = raw.LMSCommit(s);
      log.push(['LMSCommit', s]);
      capture('Commit', r);
      return r;
    },
    LMSGetLastError: () => raw.LMSGetLastError(),
    LMSGetErrorString: (c) => raw.LMSGetErrorString(c),
    LMSGetDiagnostic: (c) => raw.LMSGetDiagnostic(c),
  };

  return {
    api,
    raw,
    errors,
    log,
    dispose: () => {
      try {
        if (!raw.isTerminated()) raw.LMSFinish('');
      } catch {
        /* already torn down */
      }
    },
  };
}

export function createReal2004Lms(): RealLms2004 {
  const raw = new Scorm2004API({ ...SETTINGS });
  const errors: CapturedError[] = [];
  const log: string[][] = [];

  const capture = (key: string, ret: string) => {
    const code = raw.GetLastError();
    if (ret !== 'true' || code !== '0') errors.push({ key, code });
  };

  const api: SCORM2004API = {
    Initialize: (s) => {
      const r = raw.Initialize(s);
      log.push(['Initialize', s]);
      capture('Initialize', r);
      return r;
    },
    Terminate: (s) => {
      const r = raw.Terminate(s);
      log.push(['Terminate', s]);
      capture('Terminate', r);
      return r;
    },
    GetValue: (k) => {
      const v = raw.GetValue(k);
      log.push(['GetValue', k, v]);
      return v;
    },
    SetValue: (k, v) => {
      const r = raw.SetValue(k, v);
      log.push(['SetValue', k, v]);
      capture(k, r);
      return r;
    },
    Commit: (s) => {
      const r = raw.Commit(s);
      log.push(['Commit', s]);
      capture('Commit', r);
      return r;
    },
    GetLastError: () => raw.GetLastError(),
    GetErrorString: (c) => raw.GetErrorString(c),
    GetDiagnostic: (c) => raw.GetDiagnostic(c),
  };

  return {
    api,
    raw,
    errors,
    log,
    dispose: () => {
      try {
        if (!raw.isTerminated()) raw.Terminate('');
      } catch {
        /* already torn down */
      }
    },
  };
}

// Simulate an LMS re-launch (resume): snapshot the committed CMI off the
// finished instance and seed a fresh one with it, as an LMS restores a record
// on the next attempt.
export function relaunch12(prev: RealLms12): RealLms12 {
  const snapshot = prev.raw.getFlattenedCMI();
  prev.dispose();
  const next = createReal12Lms();
  next.raw.loadFromFlattenedJSON(snapshot);
  return next;
}

export function relaunch2004(prev: RealLms2004): RealLms2004 {
  const snapshot = prev.raw.getFlattenedCMI();
  prev.dispose();
  const next = createReal2004Lms();
  next.raw.loadFromFlattenedJSON(snapshot);
  return next;
}

/** Collect the values written for a given dotted-key prefix, from the log. */
export function writtenValues(
  log: string[][],
  prefix: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const entry of log) {
    const [method, key, value] = entry;
    if (
      (method === 'LMSSetValue' || method === 'SetValue') &&
      key?.startsWith(prefix)
    ) {
      out[key] = value;
    }
  }
  return out;
}
