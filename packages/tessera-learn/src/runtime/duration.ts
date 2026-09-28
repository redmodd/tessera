/**
 * Tracks course time-on-task. Two readouts:
 *
 *   - `totalSeconds` — cumulative across all sessions (previousSeconds +
 *     this session's elapsed). Persisted into `SavedState.d`.
 *   - `sessionSeconds` — only this session's elapsed. Fed to SCORM
 *     `cmi.(core.)session_time` and to cmi5 statement `result.duration`,
 *     both of which are session-scoped: SCORM sums session_time into
 *     `cmi.total_time` itself, and cmi5 `duration` on Completed/Passed/
 *     Failed/Terminated reflects the AU's launch session.
 */
export class DurationTracker {
  #startTime = Date.now();
  #accumulated = 0;
  #pausedAt: number | null = null;

  constructor(previousSeconds: number = 0) {
    this.#accumulated = previousSeconds;
  }

  /** Cumulative across all sessions. Use for suspend_data persistence. */
  get totalSeconds(): number {
    return this.#accumulated + this.sessionSeconds;
  }

  /** This session only. Use for SCORM session_time and cmi5 result.duration. */
  get sessionSeconds(): number {
    return Math.floor(
      ((this.#pausedAt ?? Date.now()) - this.#startTime) / 1000,
    );
  }

  pause(): void {
    this.#pausedAt ??= Date.now();
  }

  resume(): void {
    if (this.#pausedAt === null) return;
    this.#startTime += Date.now() - this.#pausedAt;
    this.#pausedAt = null;
  }
}
