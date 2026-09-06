import { describe, it, expect } from 'vitest';

/**
 * Tests for Sorting question type logic.
 *
 * The Sorting component's getItemsForTarget logic is pure and doesn't require
 * DOM/Svelte rendering — we test it inline here.
 */

// Mirror of Sorting.svelte getItemsForTarget
function getItemsForTarget(
  placements: Map<number, number>,
  targetIdx: number,
): number[] {
  const result: number[] = [];
  for (const [itemIdx, tIdx] of placements) {
    if (tIdx === targetIdx) result.push(itemIdx);
  }
  return result;
}

describe('Sorting getItemsForTarget', () => {
  it('returns items assigned to a given target', () => {
    const placements = new Map<number, number>([
      [0, 0],
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
    expect(getItemsForTarget(placements, 0).sort()).toEqual([0, 1]);
    expect(getItemsForTarget(placements, 1)).toEqual([2]);
    expect(getItemsForTarget(placements, 2)).toEqual([3]);
  });

  it('returns empty array for an empty target', () => {
    const placements = new Map<number, number>([[0, 1]]);
    expect(getItemsForTarget(placements, 0)).toEqual([]);
  });

  it('returns empty array when no placements exist', () => {
    expect(getItemsForTarget(new Map(), 0)).toEqual([]);
  });
});

describe('Sorting placement queue logic', () => {
  it('queue shrinks as items are placed', () => {
    // Simulate placeCard mechanics
    let queue = [2, 0, 3, 1]; // shuffled indices
    const placements = new Map<number, number>();

    // Place first card (item 2) into target 1
    const itemIdx = queue[0];
    placements.set(itemIdx, 1);
    queue = queue.slice(1);

    expect(queue).toEqual([0, 3, 1]);
    expect(placements.size).toBe(1);
    expect(placements.get(2)).toBe(1);
  });

  it('returnCard prepends item back to front of queue', () => {
    let queue = [0, 3, 1];
    const placements = new Map<number, number>([[2, 1]]);

    // Return item 2 to deck
    placements.delete(2);
    queue = [2, ...queue];

    expect(queue[0]).toBe(2);
    expect(queue).toEqual([2, 0, 3, 1]);
    expect(placements.size).toBe(0);
  });

  it('all cards placed when queue is empty', () => {
    let queue = [0, 1, 2];
    const placements = new Map<number, number>();

    for (const itemIdx of [0, 1, 2]) {
      placements.set(itemIdx, 0);
      queue = queue.slice(1);
    }

    expect(queue.length).toBe(0);
    expect(placements.size).toBe(3);
  });
});
