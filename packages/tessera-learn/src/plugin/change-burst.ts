import { reportValidationIssues } from './validation.js';

// The watcher reports a copied folder or a checkout one file at a time, so the
// work a change asks for waits this long after the last one to cover the burst.
const BURST_MS = 50;

/** Runs each task once for a burst of dev file changes, after the last one settles. */
export class ChangeBurst {
  #tasks = new Set<() => void>();
  #changes: Promise<unknown>[] = [];
  #settling = false;

  /** `saved` settles once a save still in progress is on disk. */
  settle(task: () => void, saved?: unknown): void {
    this.#tasks.add(task);
    this.#changes.push(
      Promise.allSettled([
        saved,
        new Promise((done) => setTimeout(done, BURST_MS)),
      ]),
    );
    if (!this.#settling) void this.#run();
  }

  async #run(): Promise<void> {
    this.#settling = true;
    do {
      await Promise.all(this.#changes.splice(0));
    } while (this.#changes.length > 0);
    const tasks = [...this.#tasks];
    this.#tasks.clear();
    this.#settling = false;
    for (const task of tasks) {
      // Nothing awaits the pass, so a throw here would end the dev server.
      try {
        task();
      } catch (error) {
        reportValidationIssues({
          errors: [(error as Error).message],
          warnings: [],
        });
      }
    }
  }
}
