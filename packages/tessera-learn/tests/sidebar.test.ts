// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from '../src/components/Sidebar.svelte';

function makeContext() {
  const page = {
    index: 0,
    title: 'Welcome',
    slug: 'welcome',
    importPath: '/pages/01-intro/01-lesson/welcome.svelte',
    quiz: null,
  };
  const manifest = {
    sections: [
      {
        title: 'Intro',
        slug: 'intro',
        lessons: [{ title: 'Lesson', slug: 'lesson', pages: [page] }],
      },
    ],
    pages: [page],
    totalPages: 1,
  };
  const nav = {
    currentPageIndex: 0,
    isPageLocked: () => false,
    prefetch: () => {},
    goToPage: () => {},
  };
  return new Map<string, unknown>([
    ['tessera-nav', { nav, manifest, progress: {}, config: { title: 'Demo' } }],
  ]);
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
    component = mount(Sidebar, { target, props: {}, context: makeContext() });

    expect(target.querySelector('.tessera-sidebar-title')!.textContent).toBe(
      'Demo',
    );
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

  it('locks pages by index when two lessons share a page slug', () => {
    const pages = [0, 1].map((index) => ({
      index,
      title: `Overview ${index}`,
      slug: '01-overview',
      importPath: `/pages/intro/lesson-${index}/01-overview.svelte`,
      quiz: null,
    }));
    const manifest = {
      sections: [
        {
          title: 'Intro',
          slug: 'intro',
          lessons: pages.map((p) => ({
            title: `Lesson ${p.index}`,
            slug: `lesson-${p.index}`,
            pages: [p],
          })),
        },
      ],
      pages,
      totalPages: 2,
    };
    const nav = {
      currentPageIndex: 0,
      isPageLocked: (i: number) => i === 1,
      prefetch: () => {},
      goToPage: () => {},
    };
    const target = document.createElement('div');
    document.body.appendChild(target);
    component = mount(Sidebar, {
      target,
      props: {},
      context: new Map<string, unknown>([
        [
          'tessera-nav',
          { nav, manifest, progress: {}, config: { title: 'D' } },
        ],
      ]),
    });

    const buttons = target.querySelectorAll('.tessera-nav-page');
    expect(buttons[0].classList.contains('locked')).toBe(false);
    expect(buttons[1].classList.contains('locked')).toBe(true);
  });
});
