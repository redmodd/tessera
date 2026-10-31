// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { flushSync, type Component } from 'svelte';
import FillInTheBlank from '../src/components/FillInTheBlank.svelte';
import Matching from '../src/components/Matching.svelte';
import MultipleChoice from '../src/components/MultipleChoice.svelte';
import Sorting from '../src/components/Sorting.svelte';
import CustomChoice from './fixtures/custom-choice.svelte';
import CustomChoiceQuiz from './fixtures/custom-choice-quiz.svelte';
import CustomChoiceUnwrapped from './fixtures/custom-choice-unwrapped.svelte';
import type { QuizConfig } from '../src/runtime/types.js';
import { mountQuestion } from './helpers/mount.js';

function mountWidget(
  widget: Component<any>,
  props: Record<string, unknown>,
  quiz?: QuizConfig,
) {
  const { target, unmount } = mountQuestion(widget, props, { quiz });
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
  return { target, button, name, click, unmount };
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
    click(button('Submit'));

    expect((button('Fruit') as HTMLButtonElement).disabled).toBe(true);
    const placed = [
      ...target.querySelectorAll<HTMLElement>('.tessera-sorting-placed-item'),
    ].map(name);
    expect(placed.sort()).toEqual(['Apple (correct)', 'Carrot (incorrect)']);
  });
});

describe('Matching accessible names', () => {
  const pairs = [
    { left: 'A', right: 'Alpha' },
    { left: 'B', right: 'Beta' },
  ];

  it('hints the next step and names each partner', () => {
    const { target, button, name, click } = mountWidget(Matching, { pairs });
    const hint = (el: HTMLElement) => {
      const id = el.getAttribute('aria-describedby');
      return id && target.querySelector(`[id="${id}"]`)?.textContent;
    };
    const a = button('A');
    expect(hint(a)).toBe('Activate, then choose a match.');
    expect(hint(button('Beta'))).toBe('Activate, then choose a match.');
    click(a);
    expect(a.getAttribute('aria-pressed')).toBe('true');
    expect(hint(a)).toBe('Choose a match.');
    expect(name(a)).toBe('A');
    expect(name(button('Beta'))).toBe('Beta (activate to match with A)');
    expect(hint(button('Beta'))).toBeNull();

    click(button('Beta'));
    expect(name(button('B'))).toBe('B');
    click(button('Alpha'));
    expect(name(button('B'))).toBe('B (activate to match with Alpha)');
    click(button('B'));
    expect(name(button('1 A'))).toBe(
      '1 A (matched with Beta, activate to unmatch)',
    );
    expect(name(button('1 Beta'))).toBe('1 Beta (matched with A)');
    expect(hint(button('1 A'))).toBeNull();
    expect(hint(button('1 Beta'))).toBe('Activate, then choose a match.');

    click(button('Submit'));
    expect(hint(button('1 A'))).toBeNull();
    expect(name(button('1 A'))).toBe('1 A (matched with Beta, incorrect)');
    expect(name(button('2 B'))).toBe('2 B (matched with Alpha, incorrect)');
    expect(name(button('1 Beta'))).toBe('1 Beta (matched with A, incorrect)');
  });

  it('makes each column one Tab stop named by its heading', () => {
    const { target } = mountWidget(Matching, {
      pairs: [...pairs, { left: 'C', right: 'Gamma' }],
    });
    const groups = [
      ...target.querySelectorAll<HTMLElement>('[role="group"]'),
    ].filter((g) => g.querySelector('.tessera-matching-item'));
    const heading = (g: HTMLElement) =>
      document
        .getElementById(g.getAttribute('aria-labelledby')!)
        ?.textContent?.trim();
    expect(groups.map(heading)).toEqual(['Match from', 'Match to']);

    const [left] = groups;
    const items = [...left.querySelectorAll<HTMLElement>('button')];
    const tabStops = () => items.filter((b) => b.tabIndex === 0);
    expect(tabStops()).toEqual([items[0]]);

    const press = (key: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...init,
      });
      document.activeElement!.dispatchEvent(e);
      flushSync();
      return e;
    };
    items[0].focus();
    press('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    expect(tabStops()).toEqual([items[1]]);
    press('End');
    expect(document.activeElement).toBe(items[2]);
    press('ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    press('ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    press('Home');
    expect(document.activeElement).toBe(items[0]);
    for (const mod of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey']) {
      expect(press('ArrowDown', { [mod]: true }).defaultPrevented).toBe(false);
      expect(document.activeElement).toBe(items[0]);
    }
  });

  it('announces when every pair is matched', () => {
    const { target, button, click } = mountWidget(Matching, { pairs });
    const live = target.querySelector('[aria-live="polite"]')!;
    click(button('A'));
    click(button('Alpha'));
    expect(live.textContent?.trim()).toBe('');
    click(button('B'));
    click(button('Beta'));
    expect(live.textContent?.trim()).toBe(
      'All pairs matched. Submit your answer below.',
    );
  });
});

type Widget = ReturnType<typeof mountWidget>;

function submitFillIn({ target, button, click }: Widget, text: string) {
  const input = target.querySelector('input')!;
  input.value = text;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  click(button('Submit'));
}

function submitOption({ target, button, click }: Widget, index: number) {
  target.querySelectorAll('input')[index].click();
  flushSync();
  click(button('Submit'));
}

describe('standalone feedback', () => {
  const focusedText = () => {
    const el = document.activeElement;
    if (!el || el === document.body) return '';
    return (el.textContent ?? '').replace(/\s+/g, ' ').trim();
  };

  it('moves focus to the Sorting result after Submit', async () => {
    const { target, button, click } = mountWidget(Sorting, {
      items: ['Apple'],
      targets: ['Fruit'],
      correct: [0],
    });
    expect((button('Submit') as HTMLButtonElement).disabled).toBe(true);
    click(target.querySelector<HTMLElement>('.tessera-sorting-card')!);
    click(button('Fruit'));
    expect(
      target.querySelector('.tessera-sorting-deck-empty')?.textContent,
    ).toBe('All cards placed. Submit your answers below.');
    expect((button('Submit') as HTMLButtonElement).disabled).toBe(false);
    button('Submit').focus();
    click(button('Submit'));

    await expect.poll(focusedText).toContain('All items sorted correctly!');
  });

  it('moves focus to the Matching result after Submit', async () => {
    const { target, button, click } = mountWidget(Matching, {
      pairs: [{ left: 'A', right: 'Alpha' }],
    });
    expect((button('Submit') as HTMLButtonElement).disabled).toBe(true);
    click(button('A'));
    click(button('Alpha'));
    expect(target.querySelector('.tessera-question-result')).toBe(null);
    click(button('Submit'));

    await expect.poll(focusedText).toContain('All pairs matched correctly!');
  });

  it('moves focus to the FillInTheBlank result, named by its text without Try again', async () => {
    const widget = mountWidget(FillInTheBlank, {
      answers: 'blue',
      incorrectFeedback: 'The sky is blue.',
    });
    submitFillIn(widget, 'red');

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
    expect((button('Submit') as HTMLButtonElement).disabled).toBe(true);
    radios[0].click();
    flushSync();

    expect(radios[0].disabled).toBe(false);
    expect((button('Submit') as HTMLButtonElement).disabled).toBe(false);
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
    expect((button('Submit') as HTMLButtonElement).disabled).toBe(false);
    expect(target.querySelector('.tessera-question-result')).toBe(null);
  });

  it('states the MultipleChoice result once and moves focus to it', async () => {
    const widget = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
      optionFeedback: ['Too low.', ''],
      incorrectFeedback: 'Not quite.',
    });
    submitOption(widget, 0);

    await expect.poll(focusedText).toBe('Incorrect Too low. Try again');
    const labels = [...widget.target.querySelectorAll('label')].map(
      widget.name,
    );
    expect(labels).toEqual(['3 (incorrect)', '4 (correct)']);
  });

  it('focuses a visible MultipleChoice result when there is no feedback', async () => {
    const widget = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    submitOption(widget, 1);

    await expect.poll(focusedText).toBe('Correct');
    expect(
      document.activeElement!.querySelector('.tessera-question-result'),
    ).not.toBe(null);
  });

  it('keeps Submit and the result outside the MultipleChoice radiogroup', () => {
    const widget = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    const { target, button } = widget;
    const group = target.querySelector('[role="radiogroup"]')!;
    expect(group.contains(button('Submit'))).toBe(false);
    submitOption(widget, 0);

    expect(group.contains(button('Try again'))).toBe(false);
    expect(
      group.contains(target.querySelector('.tessera-question-result')),
    ).toBe(false);
  });

  it('shows MultipleChoice correctFeedback once', () => {
    const widget = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
      correctFeedback: 'Well done.',
    });
    submitOption(widget, 1);

    expect(widget.target.textContent?.split('Well done.')).toHaveLength(2);
  });

  it('clears the MultipleChoice selection after Try again', () => {
    const widget = mountWidget(MultipleChoice, {
      options: ['3', '4'],
      correct: 1,
    });
    submitOption(widget, 0);
    widget.click(widget.button('Try again'));

    expect(widget.target.querySelector('input')!.checked).toBe(false);
  });

  it.each([
    {
      name: 'MultipleChoice',
      widget: MultipleChoice,
      props: { options: ['3', '4'], correct: 1 },
      first: 'input',
      answerWrong: (w: Widget) => submitOption(w, 0),
    },
    {
      name: 'FillInTheBlank',
      widget: FillInTheBlank,
      props: { answers: 'blue' },
      first: '.tessera-fitb-input',
      answerWrong: (w: Widget) => submitFillIn(w, 'red'),
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
        click(button('Submit'));
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
        click(button('Submit'));
      },
    },
    {
      name: 'custom useQuestion',
      widget: CustomChoice,
      props: { prompt: '2 + 2?', options: ['3', '4'], correct: 1 },
      first: 'input',
      answerWrong: (w: Widget) => submitOption(w, 0),
    },
  ])(
    'moves focus to the $name first control after Try again, without a Svelte warning',
    async ({ widget, props, first, answerWrong }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mounted = mountWidget(widget, props);
      answerWrong(mounted);
      await expect.poll(focusedText).toContain('Try again');
      mounted.click(mounted.button('Try again'));

      await expect
        .poll(() => document.activeElement)
        .toBe(mounted.target.querySelector(first));
      expect(warn).not.toHaveBeenCalled();
    },
  );

  it('shows a neutral result for a question with no correct answer', () => {
    const mounted = mountWidget(CustomChoice, {
      prompt: 'Favourite?',
      options: ['Red', 'Blue'],
    });
    submitOption(mounted, 0);

    const result = mounted.target.querySelector('.tessera-question-result')!;
    expect(result.textContent?.trim()).toBe('Submitted');
    expect(result.className).not.toMatch(/\b(correct|incorrect)\b/);
    expect(result.querySelector('svg')).toBeNull();
    expect(mounted.button('Try again')).toBeTruthy();
  });

  it('skips a hidden input when focusing the first control after Try again', async () => {
    const mounted = mountWidget(CustomChoice, {
      prompt: '2 + 2?',
      options: ['3', '4'],
      correct: 1,
    });
    submitOption(mounted, 0);
    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    mounted.target.querySelector('fieldset')!.before(hidden);
    mounted.click(mounted.button('Try again'));

    await expect
      .poll(() => document.activeElement)
      .toBe(mounted.target.querySelector('fieldset input'));
  });

  it.each(['Submit', 'Try again'])(
    'keeps focus the learner moves before %s focuses',
    async (pressed) => {
      const mounted = mountWidget(CustomChoice, {
        prompt: '2 + 2?',
        options: ['3', '4'],
        correct: 1,
      });
      const elsewhere = document.createElement('button');
      document.body.append(elsewhere);
      submitOption(mounted, 0);
      if (pressed === 'Try again') {
        await expect.poll(focusedText).toContain('Try again');
        mounted.click(mounted.button('Try again'));
      }
      elsewhere.focus();

      await new Promise((resolve) =>
        requestAnimationFrame(() => setTimeout(() => setTimeout(resolve))),
      );
      expect(document.activeElement).toBe(elsewhere);
      elsewhere.remove();
    },
  );

  it('does not warn when the question unmounts before Try again moves focus', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const mounted = mountWidget(CustomChoice, {
      prompt: '2 + 2?',
      options: ['3', '4'],
      correct: 1,
    });
    submitOption(mounted, 0);
    mounted.click(mounted.button('Try again'));
    mounted.unmount();

    await new Promise((resolve) =>
      requestAnimationFrame(() => setTimeout(() => setTimeout(resolve))),
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'is the page',
      nested: false,
      arrange: (t: HTMLElement) => t.classList.add('tessera-page'),
      problem: 'is the page',
    },
    {
      name: 'has no control',
      nested: true,
      arrange: () => {},
      problem: 'has no control that takes focus',
    },
    {
      name: 'holds another question',
      nested: false,
      arrange: (t: HTMLElement) =>
        t.insertAdjacentHTML(
          'beforeend',
          '<button class="tessera-question-submit">Submit</button>',
        ),
      problem: 'holds another question',
    },
  ])(
    'warns when the QuestionReview parent $name',
    async ({ nested, arrange, problem }) => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const mounted = mountWidget(CustomChoiceUnwrapped, { nested });
      arrange(mounted.target);
      mounted.click(mounted.target.querySelector('input')!);
      mounted.click(mounted.button('Submit'));
      mounted.click(mounted.button('Try again'));

      await expect
        .poll(() => warn.mock.calls.flat().join(' '))
        .toContain(`which ${problem}.`);
    },
  );
});

describe('custom widget in a quiz', () => {
  it('moves focus to the immediate-feedback result', async () => {
    const { target, button, click } = mountWidget(
      CustomChoiceQuiz,
      {},
      { feedbackMode: 'immediate' },
    );
    flushSync();
    const active = target.querySelector(
      '.tessera-quiz-question-wrapper.active',
    )!;
    click(active.querySelector('input')!);
    click(button('Submit'));

    await expect.poll(() => active.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.getAttribute('role')).toBe('group');
    expect(document.activeElement!.textContent).toContain(
      'The right answer was 4.',
    );
  });
});
