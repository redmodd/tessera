/**
 * Resolve a `$assets/foo` URL to a document-relative path so the asset works
 * under any deployment root (dev server, static hosts, LMS subpaths, file://).
 * Pass-through for absolute or external URLs.
 *
 * Shared by Image / Audio / Video and any custom component that wants the
 * same alias semantics.
 */
export function resolveAsset(src: string): string {
  if (!src) return src;
  return src.startsWith('$assets/')
    ? src.replace('$assets/', './assets/')
    : src;
}

/**
 * Build a deterministic slug from a question prompt for use as a fallback
 * `id` when the author hasn't supplied one. Stable across renders so SCORM /
 * cmi5 interaction reporting addresses the same question consistently.
 */
export function slugFromQuestion(text: unknown): string {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

export const QUESTION_ID_PREFIX = {
  MultipleChoice: 'mc',
  FillInTheBlank: 'fitb',
  Matching: 'matching',
  Sorting: 'sorting',
} as const satisfies Record<string, string>;

export type QuestionComponentName = keyof typeof QUESTION_ID_PREFIX;

/** Author-supplied `id`, or a `prefix-<slug>` fallback derived from the prompt. */
export function questionId(
  id: string | undefined,
  prefix: string,
  question: unknown,
): string {
  return id ?? `${prefix}-${slugFromQuestion(question)}`;
}

/**
 * A saved answer's index into `list`. Throws when the question was edited
 * since and no longer has it, so the answer is left out rather than misplaced.
 */
export function savedIndex(value: unknown, list: readonly unknown[]): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value) || !(value in list))
    throw new RangeError('the saved answer points past this question');
  return Number(value);
}

/** Index ids for a built-in's `options`, which SCORM 1.2 encodes one character each. */
export function indexIds(list: readonly unknown[]): string[] {
  return list.map((_, i) => String(i));
}

/** Fisher-Yates shuffle returning a fresh array. */
export function shuffle<T>(arr: readonly T[]): T[] {
  const result = arr.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
