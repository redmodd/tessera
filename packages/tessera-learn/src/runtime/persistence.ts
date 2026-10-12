/**
 * Persistence API: the lifecycle statuses and saved course state that adapters exchange.
 */

import type { Verdict } from './types.js';

export type CompletionStatus = 'incomplete' | 'complete';
export type SuccessStatus = Verdict | 'unknown';
export type ExitMode = 'suspend' | 'normal';

const encoder = new TextEncoder();

/**
 * UTF-8 size of saved JSON, the unit an adapter's `stateLimit` is counted in.
 * The SCORM limits are written in characters, but an LMS may enforce them in
 * bytes, and bytes are never the smaller count.
 */
export function savedSize(json: string): number {
  return encoder.encode(json).length;
}

export function jsonSize(value: unknown): number {
  return savedSize(JSON.stringify(value));
}

/** A standalone question's result in `GradedUnitState.q`, written without its trailing defaults. */
export type SavedQuestion = [
  score: number,
  weight: number,
  /**
   * 1 when graded, plus 2 when the response had no `correct` to judge it by,
   * or 4 when the verdict is not the one the score gives (correct under 100,
   * incorrect at 100), which takes a custom `score()`.
   */
  flags: number,
  retries?: number,
  response?: unknown,
];

/** One page's entry in `SavedState.g`. */
export interface GradedUnitState {
  /** Best quiz score across attempts */
  s?: number;
  /** Submitted quiz attempts, omitted when 1 */
  a?: number;
  /**
   * Standalone question results: questionId → score 0-100 for a graded
   * question of weight 1 whose score gives its verdict, with no retries or
   * response saved, else a {@link SavedQuestion}.
   */
  q?: Record<string, number | SavedQuestion>;
  /** Quiz responses from the best attempt, questionId → response, omitted when they don't fit */
  r?: Record<string, unknown>;
  /** Graded standalone questions on the page not yet answered, omitted when none */
  w?: string[];
}

/**
 * Compact serialization format for course state.
 * Single-letter keys to minimize storage footprint (SCORM 1.2 suspend_data is 4KB).
 */
export interface SavedState {
  /** Bookmark — current page index */
  b: number;
  /** Visited — array of page indices */
  v: number[];
  /**
   * Graded units — pageIndex (as string key) to that page's score state.
   * Every sub-key is omitted when it carries nothing, and an attempt count of
   * 1 is assumed on restore, so a plain quiz page costs `"3":{"s":80}`.
   */
  g?: Record<string, GradedUnitState>;
  /** Duration — accumulated seconds */
  d: number;
  /** Chunk progress — pageIndex (as string key) to highest revealed chunk index */
  c?: Record<string, number>;
  /** User-scoped state written via `usePersistence(key)`, keyed by caller. */
  u?: Record<string, unknown>;
  /** Manual completion latch. 1 if the learner triggered manual completion. Absent otherwise. */
  m?: 1;
  /** Graded score latch. 1 once the course score and verdict were first reported. Absent otherwise. */
  s?: 1;
  /** Completion latch. 1 once the course reached complete. Absent otherwise. */
  k?: 1;
  /** Pass latch. The best course score since the course reported passed. Absent until then. */
  p?: number;
  /** Structure fingerprint (FNV-1a over ordered page slugs) at save time.
   * On resume, anything but an exact match discards the blob. */
  f?: string;
}
