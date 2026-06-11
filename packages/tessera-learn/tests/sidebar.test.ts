// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from '../src/runtime/Sidebar.svelte';

function makeProps() {
  const page = {
    index: 0,
    title: 'Welcome',
    slug: 'welcome',
    importPath: '/pages/01-intro/01-lesson/welcome.svelte',
    quiz: null,
  };
  return {
    manifest: {
      sections: [
        {
          title: 'Intro',
          slug: 'intro',
          lessons: [{ title: 'Lesson', slug: 'lesson', pages: [page] }],
        },
      ],
      pages: [page],
      totalPages: 1,
    },
    config: { title: 'Demo' },
    currentPageIndex: 0,
    nav: { isPageLocked: () => false, prefetch: () => {} },
    onnavigate: () => {},
  };
}

describe('Sidebar section collapse', () => {
  let component: ReturnType<typeof mount> | null = null;

  afterEach(() => {
    if (component) unmount(component);
    component = null;
    document.body.innerHTML = '';
  });

  it('clicking a section title collapses and re-expands its pages', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(Sidebar, { target, props: makeProps() });

    const toggle = target.querySelector('.tessera-nav-section-title')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(target.querySelector('.tessera-nav-page')).not.toBeNull();

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(target.querySelector('.tessera-nav-page')).toBeNull();

    toggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    flushSync();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(target.querySelector('.tessera-nav-page')).not.toBeNull();
  });
});
