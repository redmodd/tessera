// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { flushSync, type Component } from 'svelte';
import Matching from '../src/components/Matching.svelte';
import Sorting from '../src/components/Sorting.svelte';
import { ProgressState } from '../src/runtime/progress.svelte.js';
import { createManifest, createConfig } from './helpers.js';
import { mountOnPage } from './helpers/mount.js';

function mountWidget(widget: Component<any>, props: Record<string, unknown>) {
  const manifest = createManifest(1);
  const config = createConfig();
  const progress = new ProgressState(manifest, config);
  const { target } = mountOnPage(
    widget,
    { id: 'q1', question: 'Question', ...props },
    { manifest, progress, config },
  );
  const buttons = () => [
    ...target.querySelectorAll<HTMLElement>('button, [role="button"]'),
  ];
  const name = (el: HTMLElement) =>
    el.getAttribute('aria-label') ??
    (el.textContent ?? '').replace(/\s+/g, ' ').trim();
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
    const remove = button("Return 'Apple' to deck");
    expect(remove.parentElement?.closest('button, [role="button"]')).toBe(null);
    expect(target.querySelector('[role="button"] button')).toBe(null);
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
