// The watcher reports a copied folder or a checkout one file at a time, so the
// work a change asks for waits this long after the last one to cover the burst.
const BURST_MS = 50;

/** Runs one task for a burst of dev file changes, after the last one settles. */
export class ChangeBurst {
  #task: (() => void) | undefined;
  #changes: Promise<unknown>[] = [];

  /** `saved` settles once a save still in progress is on disk. The latest task replaces one still waiting. */
  settle(task: () => void, saved?: unknown): void {
    const idle = this.#task === undefined;
    this.#task = task;
    this.#changes.push(
      Promise.allSettled([
        saved,
        new Promise((done) => setTimeout(done, BURST_MS)),
      ]),
    );
    if (idle) void this.#run();
  }

  async #run(): Promise<void> {
    do {
      await Promise.all(this.#changes.splice(0));
    } while (this.#changes.length > 0);
    const task = this.#task!;
    this.#task = undefined;
    task();
  }
}
