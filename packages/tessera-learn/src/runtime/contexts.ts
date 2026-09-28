/**
 * Typed Svelte contexts used by the Tessera runtime. Contexts shared across
 * the runtime (set by App.svelte and PageHost.svelte, read by hooks and
 * built-in components) live here so each shape is declared once, at its
 * `createContext` call.
 *
 * Contexts with a single owner (the quiz context in hooks.svelte.ts,
 * Accordion, Carousel) stay with that owner.
 */

import { createContext } from 'svelte';
import type { NavigationState } from './navigation.svelte.js';
import type { ProgressState } from './progress.svelte.js';
import type { Manifest } from '../plugin/manifest.js';
import type { CourseConfig, QuizConfig } from './types.js';
import type { BaseAdapter } from './adapters/base.js';

// ---- Shapes ----

export interface NavContext {
  nav: NavigationState;
  manifest: Manifest;
  progress: ProgressState;
  config: CourseConfig;
  readonly canExit: boolean;
  exit(): Promise<void>;
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

// ---- Contexts ----

// Svelte's `get` throws when no ancestor set the context; these readers
// return undefined instead.
export function optionalContext<T>() {
  const [get, set, has] = createContext<T>();
  return [(): T | undefined => (has() ? get() : undefined), set] as const;
}

export const [getNavContext, setNavContext] = optionalContext<NavContext>();
export const [getAdapterContext, setAdapterContext] =
  optionalContext<AdapterContext>();
export const [getPageContext, setPageContext] = optionalContext<PageContext>();
export const [getUserStateStore, setUserStateStore] =
  optionalContext<UserStateStore>();

/** `isInPage()` is true inside the rendered page, false in the layout around it. */
export const [, setInPage, isInPage] = createContext<true>();

// ---- Required-getter helpers ----

function notInCourse(name: string): never {
  throw new Error(`${name} must be called inside a Tessera course`);
}

export function requireNavContext(name: string): NavContext {
  return getNavContext() ?? notInCourse(name);
}

export function requireUserStateStore(name: string): UserStateStore {
  return getUserStateStore() ?? notInCourse(name);
}
