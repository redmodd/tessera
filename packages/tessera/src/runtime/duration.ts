export class DurationTracker {
  #startTime = Date.now();
  #accumulated = 0;

  constructor(previousSeconds: number = 0) {
    this.#accumulated = previousSeconds;
  }

  get totalSeconds(): number {
    return this.#accumulated + Math.floor((Date.now() - this.#startTime) / 1000);
  }
}
