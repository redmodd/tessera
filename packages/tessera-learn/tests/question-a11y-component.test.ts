// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync, type Component } from 'svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
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
    expect(name(button('1 Beta'))).toBe('1 Beta (matched, incorrect)');
  });
});

describe('standalone feedback', () => {
  const focusedText = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return '';
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  };

  it('moves focus to the Sorting result after Check Answer', async () => {
    const { target, button, click } = mountWidget(Sorting, {
      items: ['Apple'],
      targets: ['Fruit'],
      correct: [0],
    });
    click(target.querySelector<HTMLElement>('.tessera-sorting-card')!);
    click(button('Fruit'));
    button('Check Answer').focus();
    click(button('Check Answer'));

    await expect.poll(focusedText).toContain('All items sorted correctly!');
  });

  it('moves focus to the Matching result after the last pair', async () => {
    const { button, click } = mountWidget(Matching, {
      pairs: [{ left: 'A', right: 'Alpha' }],
    });
    click(button('A'));
    click(button('Alpha'));

    await expect.poll(focusedText).toContain('All pairs matched correctly!');
  });

  it('moves focus to the FillInTheBlank result after Check', async () => {
    const { target, button, click } = mountWidget(FillInTheBlank, {
      answers: 'blue',
      incorrectFeedback: 'The sky is blue.',
    });
    const input = target.querySelector('input')!;
    input.value = 'red';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    click(button('Check'));

    await expect.poll(focusedText).toContain('Incorrect');
    expect(focusedText()).toContain('The sky is blue.');
  });

  it('states the MultipleChoice result and moves focus to it', async () => {
    const { target } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
      optionFeedback: ['Too low.', ''],
    });
    const radios = target.querySelectorAll<HTMLInputElement>('input');
    radios[0].click();
    flushSync();

    await expect.poll(focusedText).toBe('Incorrect. Too low. Try again');
    const labels = [...target.querySelectorAll('label')].map((l) =>
      l.textContent?.replace(/\s+/g, ' ').trim(),
    );
    expect(labels).toEqual(['3 (incorrect) Too low.', '4 (correct)']);
  });
});
