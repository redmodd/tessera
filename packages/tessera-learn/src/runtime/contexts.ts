/**
 * Typed Svelte context keys used by the Tessera runtime. All cross-cutting
 * contexts (set by App.svelte, read by hooks and built-in components) live
 * here so the shape is declared once and consumers don't have to spell out
 * `getContext<...>('tessera-...')` casts.
 *
 * Component-internal contexts (e.g. tessera-quiz, tessera-accordion) stay
 * with their owning component — they are not shared across the runtime.
 */

import { getContext } from 'svelte';
import type { NavigationState } from './navigation.svelte.js';
import type { ProgressState } from './progress.svelte.js';
import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig, QuizConfig } from './types.js';
import type { BaseAdapter } from './adapters/base.js';

// ---- Keys ----

export const TESSERA_NAV = 'tessera-nav' as const;
export const TESSERA_ADAPTER = 'tessera-adapter' as const;
export const TESSERA_PAGE = 'tessera-page' as const;
export const TESSERA_IN_PAGE = 'tessera-in-page' as const;
export const TESSERA_USER_STATE = 'tessera-user-state' as const;

// ---- Shapes ----

export interface NavContext {
  nav: NavigationState;
  manifest: Manifest;
  progress: ProgressState;
  config: CourseConfig;
}

export interface AdapterContext {
  readonly adapter: BaseAdapter;
}

/** Saved quiz progress for the current page, seeded into a fresh QuizEngine. */
export interface QuizPageState {
  attempts: number;
  score: number;
}

export interface PageContext {
  quiz: QuizConfig | null;
  quizState: QuizPageState | null;
  passingScore: number;
  /** The rendered page, or undefined before the first one renders. */
  readonly index: number | undefined;
}

export interface UserStateStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
}

// ---- Required-getter helpers ----

function notInCourse(name: string): never {
  throw new Error(`${name} must be called inside a Tessera course`);
}

export function requireNavContext(name: string): NavContext {
  const ctx = getContext<NavContext | undefined>(TESSERA_NAV);
  if (!ctx) notInCourse(name);
  return ctx;
}

export function getNavContext(): NavContext | undefined {
  return getContext<NavContext | undefined>(TESSERA_NAV);
}

export function getAdapterContext(): AdapterContext | undefined {
  return getContext<AdapterContext | undefined>(TESSERA_ADAPTER);
}

export function getPageContext(): PageContext | undefined {
  return getContext<PageContext | undefined>(TESSERA_PAGE);
}

/** True inside the rendered page, false in the layout around it. */
export function isInPage(): boolean {
  return getContext<boolean | undefined>(TESSERA_IN_PAGE) === true;
}

export function requireUserStateStore(name: string): UserStateStore {
  const store = getContext<UserStateStore | undefined>(TESSERA_USER_STATE);
  if (!store) notInCourse(name);
  return store;
}
