// The watcher reports a copied folder or a checkout one file at a time, so the
// work a change asks for waits this long after the last one to cover the burst.
const BURST_MS = 50;

/** Runs one task for a burst of dev file changes, after the last one settles. */
export class ChangeBurst {
  #task: (() => void) | undefined;
  #unsettled = 0;

  /** `saved` settles once a save still in progress is on disk. The latest task replaces one still waiting. */
  settle(task: () => void, saved?: unknown): void {
    this.#task = task;
    this.#unsettled++;
    void Promise.allSettled([
      saved,
      new Promise((done) => setTimeout(done, BURST_MS)),
    ]).then(() => {
      if (--this.#unsettled === 0) this.#task!();
    });
  }
}
