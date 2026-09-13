// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import Sidebar from '../src/components/Sidebar.svelte';

function mountSidebar({
  slugs = ['welcome'],
  isPageLocked = (_i: number) => false,
  config = { title: 'Demo' } as object,
} = {}) {
  const pages = slugs.map((slug, index) => ({
    index,
    title: `Page ${index}`,
    slug,
    importPath: `/pages/intro/lesson-${index}/${slug}.svelte`,
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
    totalPages: pages.length,
  };
  const nav = {
    currentPageIndex: 0,
    isPageLocked,
    prefetch: () => {},
    goToPage: () => {},
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  component = mount(Sidebar, {
    target,
    props: {},
    context: new Map([
      ['tessera-nav', { nav, manifest, progress: {}, config }],
    ]),
  });
  return target;
}

let component: ReturnType<typeof mount> | null = null;

describe('Sidebar', () => {
  afterEach(() => {
    if (component) unmount(component);
    component = null;
    document.body.innerHTML = '';
  });

  it('clicking a section title collapses and re-expands its pages', () => {
    const target = mountSidebar();

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

  it('renders the course title and resolves a $assets logo', () => {
    const target = mountSidebar({
      config: { title: 'Demo', branding: { logo: '$assets/logo.png' } },
    });

    expect(target.querySelector('.tessera-sidebar-title')!.textContent).toBe(
      'Demo',
    );
    expect(
      target.querySelector('.tessera-sidebar-logo')!.getAttribute('src'),
    ).toBe('./assets/logo.png');
  });

  it('locks pages by index when two lessons share a page slug', () => {
    const target = mountSidebar({
      slugs: ['01-overview', '01-overview'],
      isPageLocked: (i) => i === 1,
    });

    const buttons = target.querySelectorAll('.tessera-nav-page');
    expect(buttons[0].classList.contains('locked')).toBe(false);
    expect(buttons[1].classList.contains('locked')).toBe(true);
  });
});
