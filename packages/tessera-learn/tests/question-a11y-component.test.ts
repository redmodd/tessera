// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync, type Component } from 'svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import { mountQuestion } from './helpers/mount.js';

function mountWidget(widget: Component<any>, props: Record<string, unknown>) {
  const { target } = mountQuestion(widget, props);
  const buttons = () => [
    ...target.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ];
  const name = (el: HTMLElement) => {
    const visible = el.cloneNode(true) as HTMLElement;
    visible.querySelectorAll('[aria-hidden="true"]').forEach((n) => n.remove());
    return (
      el.getAttribute('aria-label') ??
      (visible.textContent ?? '').replace(/\s+/g, ' ').trim()
    );
  };
  const button = (start: string) => {
    const found = buttons().find((b) => name(b).startsWith(start));
    if (!found) throw new Error(`no button named "${start}…"`);
    return found;
  };
  const click = (el: HTMLElement) => {
    el.click();
    flushSync();
  };
  return { target, button, name, click };
}

describe('Sorting accessible names', () => {
  it('names the card and targets from their visible text', () => {
    const { target, button, name, click } = mountWidget(Sorting, {
      items: ['Apple'],
      targets: ['Fruit', 'Vegetable'],
      correct: [0],
    });
    const card = button('Apple');
    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(button('Fruit').getAttribute('aria-disabled')).toBe('true');

    click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(name(button('Fruit'))).toBe('Fruit (activate to place Apple)');

    click(button('Fruit'));
    expect(button("Return 'Apple' to deck")).toBeTruthy();
    const control = ':is(button, [role="button"])';
    expect(target.querySelector(`${control} ${control}`)).toBe(null);
    // The target button already names the group; a group label is read twice.
    expect(target.querySelector('[role="group"][aria-label]')).toBe(null);
  });

  it('moves focus to the returned card', async () => {
    const { target, button, click } = mountWidget(Sorting, {
      items: ['Apple'],
      targets: ['Fruit'],
      correct: [0],
    });
    click(button('Apple'));
    click(button('Fruit'));
    button("Return 'Apple' to deck").focus();
    click(button("Return 'Apple' to deck"));

    const card = target.querySelector('.tessera-sorting-card');
    expect(card?.textContent).toContain('Apple');
    await expect.poll(() => document.activeElement).toBe(card);
  });

  it('clears the selection when a placed card returns to the deck', () => {
    const { target, button, name, click } = mountWidget(Sorting, {
      items: ['Apple', 'Pear'],
      targets: ['Fruit'],
      correct: [0, 0],
    });
    const card = target.querySelector<HTMLElement>('.tessera-sorting-card')!;
    click(card);
    click(button('Fruit'));
    click(card);
    click(button('Return'));

    expect(card.getAttribute('aria-pressed')).toBe('false');
    expect(name(button('Fruit'))).toBe('Fruit');
  });

  it('disables targets and states each placement result once locked', () => {
    const { target, button, name, click } = mountWidget(Sorting, {
      items: ['Apple', 'Carrot'],
      targets: ['Fruit', 'Vegetable'],
      correct: [0, 1],
    });
    for (let i = 0; i < 2; i++) {
      click(target.querySelector<HTMLElement>('.tessera-sorting-card')!);
      click(button('Fruit'));
    }
    click(button('Check Answer'));

    expect((button('Fruit') as HTMLButtonElement).disabled).toBe(true);
    const placed = [
      ...target.querySelectorAll<HTMLElement>('.tessera-sorting-placed-item'),
    ].map(name);
    expect(placed.sort()).toEqual(['Apple (correct)', 'Carrot (incorrect)']);
  });
});

describe('Matching accessible names', () => {
  it('exposes the pending selection and each locked match result', () => {
    const { button, name, click } = mountWidget(Matching, {
      pairs: [
        { left: 'A', right: 'Alpha' },
        { left: 'B', right: 'Beta' },
      ],
    });
    const a = button('A');
    click(a);
    expect(a.getAttribute('aria-pressed')).toBe('true');

    click(button('Beta'));
    click(button('B'));
    click(button('Alpha'));

    expect(name(button('1 A'))).toBe('1 A (matched, incorrect)');
    expect(name(button('2 B'))).toBe('2 B (matched, incorrect)');
    expect(name(button('1 Beta'))).toBe('1 Beta (matched)');
  });
});
