import { describe, it, expect, vi } from 'vitest';
import { DurationTracker } from '../src/runtime/duration.js';
import { useFakeTimers } from './helpers.js';

describe('DurationTracker', () => {
  it('starts at 0 with no previous seconds', () => {
    const tracker = new DurationTracker();
    expect(tracker.totalSeconds).toBe(0);
  });

  it('starts at previous seconds value', () => {
    const tracker = new DurationTracker();
    tracker.setPrevious(120);
    expect(tracker.totalSeconds).toBeGreaterThanOrEqual(120);
  });

  it('accumulates time', () => {
    useFakeTimers();
    const tracker = new DurationTracker();

    vi.advanceTimersByTime(5000);
    expect(tracker.totalSeconds).toBe(5);

    vi.advanceTimersByTime(10000);
    expect(tracker.totalSeconds).toBe(15);
  });

  it('adds elapsed time to previous seconds', () => {
    useFakeTimers();
    const tracker = new DurationTracker();
    tracker.setPrevious(60);

    vi.advanceTimersByTime(30000);
    expect(tracker.totalSeconds).toBe(90);
  });

  it('keeps the session time elapsed before previous seconds are set', () => {
    useFakeTimers();
    const tracker = new DurationTracker();

    vi.advanceTimersByTime(4000);
    tracker.setPrevious(60);
    vi.advanceTimersByTime(1000);

    expect(tracker.sessionSeconds).toBe(5);
    expect(tracker.totalSeconds).toBe(65);
  });
});
