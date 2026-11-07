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
 * Latin letters NFKD does not split into a base letter and an accent: the
 * stroked, hooked and barred letters of Latin-1, Extended-A and -B, with the
 * lowercase forms IPA holds. Letters with no plain form (ə, ʒ, ɣ) stay out.
 */
const STROKED =
  'ØøŁłĐđÐðĦħıĸŊŋŦŧƀƁɓƂƃƇƈƉɖƊɗƋƌƐɛƑƒƓɠƗɨƘƙƚƝɲƞƟɵƤƥƫƬƭƮʈƲʋƳƴƵƶǤǥȤȥȴȵȶȷȺⱥȻȼȽȾⱦȿɀɃɄɆɇɈɉɊɋɌɍɎɏƆɔ';
const STROKED_BASE =
  'OoLlDdDdHhikNnTtbBbBbCcDdDdDdEeFfGgIiKklNnnOoPptTtTtVvYyZzGgZzlntjAaCcLTtszBUEeJjQqRrYyOo';
const UNSPLIT_LETTERS: Record<string, string> = {
  ...Object.fromEntries([...STROKED].map((c, k) => [c, STROKED_BASE[k]])),
  ß: 'ss',
  ẞ: 'SS',
  æ: 'ae',
  Æ: 'AE',
  œ: 'oe',
  Œ: 'OE',
  þ: 'th',
  Þ: 'Th',
};

/** Accented Latin letters spelled without their accents. */
export function latin(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/./gu, (c) => UNSPLIT_LETTERS[c] ?? c);
}

/** 32-bit FNV-1a over `text`'s UTF-16 units, in base 36. */
export function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/**
 * Latin letters and accents encoded by Unicode 5.2, which every engine's
 * tables agree on. Newer characters normalize differently in the build and
 * older browsers, so they stay as they are.
 */
const OLD_LATIN =
  /[A-Za-z][\u0300-\u036f]+|[\u00c0-\u02af\u1e00-\u1eff\u2c60-\u2c7f][\u0300-\u036f]*/g;

/** `text` as lowercase ASCII words, and how many characters it could not spell. */
function spell(text: string): [slug: string, unspelled: number] {
  const plain = text.replace(OLD_LATIN, latin);
  const words = plain.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  return [words.join('-'), plain.match(/[^\0-\x7f]/gu)?.length ?? 0];
}

/**
 * A question prompt as a slug, the fallback `id` when the author supplies
 * none: its Latin words without accents, cut at 40 characters, where each
 * character the slug cannot spell counts as one. When the prompt up to the
 * cut has a character outside ASCII (`pêche`, `東京`, `’`), the slug also
 * gets a hash of that part, so prompts differing only in those characters
 * stay distinct. Edits past the cut keep the id.
 */
export function slugFromQuestion(text: unknown): string {
  const prompt = String(text ?? '').replace(OLD_LATIN, (c) =>
    c.normalize('NFC'),
  );
  let head = '';
  let slug = '';
  for (const c of prompt) {
    const [next, unspelled] = spell(head + c);
    if (next.length + unspelled > 40) break;
    head += c;
    slug = next;
  }
  if (!/[^\0-\x7f]/.test(head)) return slug;
  const hash = fnv1a(head);
  return slug ? `${slug}-${hash}` : hash;
}

export const QUESTION_ID_PREFIX = {
  MultipleChoice: 'mc',
  FillInTheBlank: 'fitb',
  Matching: 'matching',
  Sorting: 'sorting',
} as const satisfies Record<string, string>;

export type QuestionComponentName = keyof typeof QUESTION_ID_PREFIX;

/** Matching pair badge colors, cycled by pair index. Each carries a white number. */
export const MATCH_PAIR_COLORS = [
  '#2563eb',
  '#9333ea',
  '#0e7490',
  '#c2410c',
  '#4f46e5',
  '#0f766e',
  '#be185d',
  '#7c3aed',
  '#0369a1',
  '#a16207',
] as const;

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

/** FillInTheBlank's accepted answers: trimmed, blanks dropped. */
export function fillInAnswers(answers: string | string[]): string[] {
  return (Array.isArray(answers) ? answers : [answers])
    .map((a) => a.trim())
    .filter((a) => a !== '');
}

/**
 * A built-in's options as index ids (SCORM 1.2 encodes one character each)
 * with the text each shows. Authors can pass numbers, which render as text.
 */
export function indexOptions(
  texts: readonly unknown[],
): Array<{ id: string; text: string }> {
  return texts.map((text, i) => ({ id: String(i), text: String(text ?? '') }));
}

/**
 * Roving-focus target for item `i` of `length`: `step` maps arrow keys to a
 * wrapping offset, plus Home and End. Undefined for other keys or modifiers.
 */
export function rovingIndex(
  e: KeyboardEvent,
  i: number,
  length: number,
  step: Partial<Record<string, number>>,
): number | undefined {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return undefined;
  const offset = step[e.key];
  if (offset !== undefined) return (i + offset + length) % length;
  if (e.key === 'Home') return 0;
  if (e.key === 'End') return length - 1;
  return undefined;
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
