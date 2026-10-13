/**
 * Tracks course time-on-task. Two readouts:
 *
 *   - `totalSeconds`: cumulative across all sessions (previousSeconds +
 *     this session's elapsed). Persisted into `SavedState.d` and sent as
 *     `result.duration` on xAPI and cmi5 statements.
 *   - `sessionSeconds`: only this session's elapsed. Fed to SCORM
 *     `cmi.(core.)session_time` and to the cmi5 Terminated statement. Both
 *     are session-scoped, and the LMS sums them into its own total.
 */
export class DurationTracker {
  #startTime = Date.now();
  #accumulated = 0;
  #pausedAt: number | null = null;

  setPrevious(previousSeconds: number): void {
    this.#accumulated =
      Number.isFinite(previousSeconds) && previousSeconds > 0
        ? previousSeconds
        : 0;
  }

  /** Cumulative across all sessions. */
  get totalSeconds(): number {
    return this.#accumulated + this.sessionSeconds;
  }

  /** This session only. */
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
