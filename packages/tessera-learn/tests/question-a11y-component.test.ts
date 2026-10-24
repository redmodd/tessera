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

    const description = () =>
      target.querySelector(`[id="${card.getAttribute('aria-describedby')}"]`)
        ?.textContent;
    expect(name(card)).toBe('Apple');
    expect(description()).toBe('Activate, then choose a target.');

    click(card);
    expect(card.getAttribute('aria-pressed')).toBe('true');
    expect(name(card)).toBe('Apple');
    expect(description()).toBe('Choose a target.');
    expect(name(button('Fruit'))).toBe('Fruit (activate to place Apple)');

    click(button('Fruit'));
    expect(button("Return 'Apple' to deck")).toBeTruthy();
    const control = ':is(button, [role="button"])';
    expect(target.querySelector(`${control} ${control}`)).toBe(null);
    // The target button already names the item; a label is read twice.
    const items = target.querySelectorAll('[role="list"] > [role="listitem"]');
    expect(items).toHaveLength(2);
    expect(target.querySelector('[role="listitem"][aria-label]')).toBe(null);
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

  it('names the focused result by its text, without Try again', async () => {
    const { target, button, click } = mountWidget(FillInTheBlank, {
      answers: 'blue',
      incorrectFeedback: 'The sky is blue.',
    });
    const input = target.querySelector('input')!;
    input.value = 'red';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    click(button('Check'));

    await expect.poll(focusedText).toContain('Try again');
    const result = document.activeElement!;
    expect(result.getAttribute('role')).toBe('group');
    const label = document
      .getElementById(result.getAttribute('aria-labelledby')!)!
      .textContent!.replace(/\s+/g, ' ');
    expect(label).toContain('Incorrect');
    expect(label).toContain('The sky is blue.');
    expect(label).not.toContain('Try again');
  });

  it('selects a MultipleChoice option without submitting it', () => {
    const { target, button } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    const radios = target.querySelectorAll<HTMLInputElement>('input');
    expect((button('Check') as HTMLButtonElement).disabled).toBe(true);
    radios[0].click();
    flushSync();

    expect(radios[0].disabled).toBe(false);
    expect((button('Check') as HTMLButtonElement).disabled).toBe(false);
  });

  it('selects the focused MultipleChoice option on Enter without submitting it', () => {
    const { target, button } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    const radios = target.querySelectorAll<HTMLInputElement>('input');
    radios[0].focus();
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    radios[0].dispatchEvent(enter);
    flushSync();

    expect(enter.defaultPrevented).toBe(true);
    expect(radios[0].checked).toBe(true);
    expect((button('Check') as HTMLButtonElement).disabled).toBe(false);
    expect(target.querySelector('.tessera-question-result')).toBe(null);
  });

  it('states the MultipleChoice result once and moves focus to it', async () => {
    const { target, button, name, click } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
      optionFeedback: ['Too low.', ''],
    });
    target.querySelector('input')!.click();
    flushSync();
    click(button('Check'));

    await expect.poll(focusedText).toBe('Incorrect Too low. Try again');
    const labels = [...target.querySelectorAll('label')].map(name);
    expect(labels).toEqual(['3 (incorrect)', '4 (correct)']);
  });

  it('focuses a visible MultipleChoice result when there is no feedback', async () => {
    const { target, button, click } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    target.querySelectorAll('input')[1].click();
    flushSync();
    click(button('Check'));

    await expect.poll(focusedText).toBe('Correct');
    expect(
      document.activeElement!.querySelector('.tessera-question-result'),
    ).not.toBe(null);
  });

  it('keeps Check and the result outside the MultipleChoice radiogroup', () => {
    const { target, button, click } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    const group = target.querySelector('[role="radiogroup"]')!;
    expect(group.contains(button('Check'))).toBe(false);
    target.querySelector('input')!.click();
    flushSync();
    click(button('Check'));

    expect(group.contains(button('Try again'))).toBe(false);
    expect(
      group.contains(target.querySelector('.tessera-question-result')),
    ).toBe(false);
  });

  it('shows MultipleChoice correctFeedback once', () => {
    const { target, button, click } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
      correctFeedback: 'Well done.',
    });
    target.querySelectorAll('input')[1].click();
    flushSync();
    click(button('Check'));

    expect(target.textContent?.split('Well done.')).toHaveLength(2);
  });

  it('clears the MultipleChoice selection after Try again', () => {
    const { target, button, click } = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    const first = target.querySelector('input')!;
    first.click();
    flushSync();
    click(button('Check'));
    click(button('Try again'));

    expect(first.checked).toBe(false);
  });

  type Widget = ReturnType<typeof mountWidget>;
  it.each([
    {
      name: 'MultipleChoice',
      widget: MultipleChoice,
      props: { options: ['3', '4'], correct: 1 },
      first: 'input',
      answerWrong: ({ target, button, click }: Widget) => {
        target.querySelector('input')!.click();
        flushSync();
        click(button('Check'));
      },
    },
    {
      name: 'FillInTheBlank',
      widget: FillInTheBlank,
      props: { answers: 'blue' },
      first: '.tessera-fitb-input',
      answerWrong: ({ target, button, click }: Widget) => {
        const input = target.querySelector('input')!;
        input.value = 'red';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        flushSync();
        click(button('Check'));
      },
    },
    {
      name: 'Matching',
      widget: Matching,
      props: {
        pairs: [
          { left: 'A', right: 'Alpha' },
          { left: 'B', right: 'Beta' },
        ],
      },
      first: '.tessera-matching-item.left',
      answerWrong: ({ button, click }: Widget) => {
        click(button('A'));
        click(button('Beta'));
        click(button('B'));
        click(button('Alpha'));
      },
    },
    {
      name: 'Sorting',
      widget: Sorting,
      props: {
        items: ['Apple'],
        targets: ['Fruit', 'Vegetable'],
        correct: [1],
      },
      first: '.tessera-sorting-card',
      answerWrong: ({ target, button, click }: Widget) => {
        click(target.querySelector<HTMLElement>('.tessera-sorting-card')!);
        click(button('Fruit'));
        click(button('Check Answer'));
      },
    },
  ])(
    'moves focus to the $name first control after Try again',
    async ({ widget, props, first, answerWrong }) => {
      const mounted = mountWidget(widget, props);
      answerWrong(mounted);
      await expect.poll(focusedText).toContain('Try again');
      mounted.click(mounted.button('Try again'));

      await expect
        .poll(() => document.activeElement)
        .toBe(mounted.target.querySelector(first));
    },
  );
});
