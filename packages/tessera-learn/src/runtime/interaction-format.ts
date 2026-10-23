/**
 * SCORM 1.2 RTE §3.4.7 vs SCORM 2004 4E RTE §4.2.7 differ in delimiter
 * encoding and identifier rules; cmi5 and xAPI reuse 2004's encoding
 * without its caps.
 */

import { reversedRange, stepRange, type Interaction } from './interaction.js';

export interface InteractionFormat {
  itemDelim: string;
  pairDelim: string;
  rangeDelim: string;
  /**
   * SCORM 2004 writes a `numeric` or `performance` step range as `min[:]max`;
   * SCORM 1.2 has no range syntax, so it leaves a correct range out.
   */
  supportsRange: boolean;
  /**
   * SCORM 2004 4E RTE §4.2.7 allows fill-in patterns to carry a
   * `{case_matters=true}` prefix; SCORM 1.2 has no such syntax.
   */
  supportsCasePrefix: boolean;
  encodesOptionIndex: boolean;
  /**
   * SCORM 2004 4E RTE §4.2.7 caps `correct_responses` at 10 patterns for
   * `fill-in` and 1 for `long-fill-in`.
   */
  fillInLimit: number;
  longFillInLimit: number;
  /**
   * Longest response or correct answer the LMS takes for a type. SCORM 1.2
   * caps every CMIFeedback value at 255 characters; SCORM 2004 caps each
   * fill-in answer at 250 and long-fill-in and other at 4000. Strict LMSs
   * reject a longer value (405 / 406).
   */
  maxValueLength(type: Interaction['type']): number;
  /** SCORM 2004 caps each performance step answer at 250 characters. */
  maxStepAnswerLength: number;
  /** SCORM 2004 keeps an unnamed step as `[.]answer`; SCORM 1.2 names it `_`. */
  namelessSteps: boolean;
  /** What the LMS rejects in a value, by type. Unset when it rejects nothing. */
  rules?: ValueRules;
  formatBoolean(value: boolean): string;
  identifier(value: string): string;
  /** Ids inside a response: list items, matching ids, step names, likert. */
  responseId(value: string, max?: number): string;
}

/**
 * Rules for a value's items: list items, steps (`name[.]answer`), or the
 * `[,]`-separated parts of a fill-in.
 */
interface ItemRule {
  maxItems?: number;
  maxParts?: number;
  /** Rejects a list with no items. */
  nonEmpty?: boolean;
  /**
   * Items are steps. Each needs a name or an answer, and an answer can't hold
   * `[,]`, `[.]` or `[:]` unless `range` lets it be a `min[:]max` range.
   */
  steps?: 'text' | 'range';
}

/**
 * In a correct answer, breaking `maxParts`, `trimmed` or `unique` drops only
 * that answer; breaking any other rule leaves out the whole field.
 */
interface AnswerRule extends ItemRule {
  /** Rejects an item starting or ending in whitespace. */
  trimmed?: boolean;
  /** Rejects a repeated item. */
  unique?: boolean;
}

type ValueRules = Partial<
  Record<Interaction['type'], { response?: ItemRule; correct?: AnswerRule }>
>;

const LIST: ItemRule = { maxItems: 36, nonEmpty: true };
const STEPS: ItemRule = { maxItems: 250, nonEmpty: true, steps: 'text' };

/**
 * scorm-again's SCORM 2004 grammar. Encoded ids hold no whitespace, and choice
 * and matching items are already deduplicated.
 */
const SCORM2004_RULES: ValueRules = {
  // An empty choice pattern means "no choice is correct".
  choice: { response: LIST, correct: { ...LIST, nonEmpty: false } },
  sequencing: { response: LIST, correct: { ...LIST, unique: true } },
  matching: { response: LIST, correct: LIST },
  performance: {
    response: STEPS,
    correct: { ...STEPS, steps: 'range', trimmed: true, unique: true },
  },
  'fill-in': {
    response: { maxParts: 10 },
    correct: { maxParts: 10, trimmed: true, unique: true },
  },
  'long-fill-in': { correct: { trimmed: true } },
  other: { correct: { trimmed: true } },
};

export const SCORM12_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: ',',
  pairDelim: '.',
  rangeDelim: ':',
  supportsRange: false,
  supportsCasePrefix: false,
  encodesOptionIndex: true,
  fillInLimit: 10,
  longFillInLimit: 10,
  maxValueLength: () => 255,
  maxStepAnswerLength: Infinity,
  namelessSteps: false,
  formatBoolean: (v) => (v ? 't' : 'f'),
  identifier: shortIdentifier,
  responseId: shortIdentifier,
};

/**
 * Bracketed delimiters are literal text, not regex. xAPI parses them the
 * same way.
 */
export const SCORM2004_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: '[,]',
  pairDelim: '[.]',
  rangeDelim: '[:]',
  supportsRange: true,
  supportsCasePrefix: true,
  encodesOptionIndex: false,
  fillInLimit: 10,
  longFillInLimit: 1,
  maxValueLength: (type) => {
    switch (type) {
      case 'fill-in':
        return 250;
      case 'long-fill-in':
      case 'other':
        return 4000;
      default:
        return Infinity;
    }
  },
  maxStepAnswerLength: 250,
  namelessSteps: true,
  rules: SCORM2004_RULES,
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
  responseId: uriIdentifier,
};

export const XAPI_INTERACTION_FORMAT: InteractionFormat = {
  ...SCORM2004_INTERACTION_FORMAT,
  fillInLimit: Infinity,
  longFillInLimit: Infinity,
  maxValueLength: () => Infinity,
  maxStepAnswerLength: Infinity,
  rules: undefined,
  responseId: (v) => v,
};

/**
 * SCORM `short_identifier_type` / `CMIIdentifier`: alphanumerics +
 * underscore, max 250 chars. Strict validators (SCORM Cloud) reject raw
 * option labels with spaces or punctuation with error 405/406.
 */
export function shortIdentifier(value: string, max = 250): string {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const trimmed = cleaned.slice(0, max);
  return trimmed || '_';
}

/** The characters scorm-again's SCORM 2004 `CMIShortIdentifier` takes, less `%`. */
const URI_ID_CHAR = /[\w\-()+.:=@;$!*'/#]/;

/**
 * SCORM 2004 `short_identifier_type`. Characters outside that set, and `%`,
 * are percent-encoded. scorm-again refuses an id with no letter, digit or
 * underscore, so such an id escapes every character. The 250-character cut
 * keeps each character's escapes whole. The cut, the `_` for an empty id and
 * the U+FFFD for a lone surrogate can record distinct ids as one.
 */
function uriIdentifier(value: string, max = 250): string {
  let id = '';
  for (const c of value.replace(/\p{Cs}/gu, '\uFFFD')) {
    const encoded = URI_ID_CHAR.test(c)
      ? c
      : c === '~'
        ? '%7E'
        : encodeURIComponent(c);
    if (id.length + encoded.length > max) break;
    id += encoded;
  }
  if (/\w/.test(id)) return id;
  const escaped = id.replace(
    /./g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return escaped.slice(0, Math.floor(max / 3) * 3) || '_';
}

export const SCORM12_MAX_OPTIONS = 36;

const CASE_PREFIX = '{case_matters=true}';

/** A value the format cannot record, so its field is left out of the LMS record. */
class UnrecordableError extends Error {}

/** SCORM 1.2 records a list id as its position in the options passed. */
function recordsIndex<T extends object>(
  options: T | undefined,
  fmt: InteractionFormat,
): options is T {
  return fmt.encodesOptionIndex && options !== undefined;
}

/**
 * SCORM 1.2 CMIFeedback takes one character per choice or matching id
 * (0-9, a-z), so an index encodes as one base-36 digit.
 */
function encodeListItem(
  value: string,
  options: string[] | undefined,
  fmt: InteractionFormat,
): string {
  if (!recordsIndex(options, fmt)) return fmt.responseId(value);
  const idx = options.indexOf(value);
  if (idx < 0) {
    throw new UnrecordableError(`"${value}" is not in its options`);
  }
  if (idx >= SCORM12_MAX_OPTIONS) {
    throw new UnrecordableError(
      `option ${idx + 1} is past the ${SCORM12_MAX_OPTIONS} options SCORM 1.2 can record`,
    );
  }
  return idx.toString(36);
}

function encodePair(
  [l, r]: [string, string],
  optionPairs: { left: string[]; right: string[] } | undefined,
  fmt: InteractionFormat,
): string {
  return `${encodeListItem(l, optionPairs?.left, fmt)}${fmt.pairDelim}${encodeListItem(r, optionPairs?.right, fmt)}`;
}

function stepName(step: string, fmt: InteractionFormat): string {
  return step === '' && fmt.namelessSteps ? '' : fmt.responseId(step);
}

/** Step names are identifiers; step answers are free text, kept as written. */
function encodeStep(
  [step, answer]: [string, string | number],
  fmt: InteractionFormat,
): string {
  return `${stepName(step, fmt)}${fmt.pairDelim}${answer}`;
}

const LIST_TYPES = ['choice', 'sequencing', 'matching', 'performance'] as const;

type ListInteraction = Extract<
  Interaction,
  { type: (typeof LIST_TYPES)[number] }
>;

function isList(i: Interaction): i is ListInteraction {
  return (LIST_TYPES as readonly string[]).includes(i.type);
}

function encodeItems(
  i: ListInteraction,
  field: 'response' | 'correct',
  fmt: InteractionFormat,
): string[] {
  switch (i.type) {
    case 'choice':
      // Choice and matching answers are sets; SCORM 2004 rejects a repeated item.
      return [
        ...new Set(
          (i[field] ?? []).map((v) => encodeListItem(v, i.options, fmt)),
        ),
      ];
    case 'matching':
      return [
        ...new Set(
          (i[field] ?? []).map((p) => encodePair(p, i.optionPairs, fmt)),
        ),
      ];
    case 'sequencing':
      return (i[field] ?? []).map((v) => encodeListItem(v, i.options, fmt));
    case 'performance':
      return (i[field] ?? []).map((s) => encodeStep(s, fmt));
  }
}

/** The response's items, not yet joined. */
function responseItems(i: Interaction, fmt: InteractionFormat): string[] {
  if (isList(i)) return encodeItems(i, 'response', fmt);
  switch (i.type) {
    case 'true-false':
      return [fmt.formatBoolean(i.response)];
    case 'fill-in':
      return i.response.split(fmt.itemDelim);
    case 'long-fill-in':
    case 'other':
      return [i.response];
    case 'likert':
      return [fmt.responseId(i.response)];
    case 'numeric':
      return [String(i.response)];
  }
}

/** Each correct answer's items, not yet joined. Null when none was provided. */
function correctItems(
  i: Interaction,
  fmt: InteractionFormat,
): string[][] | null {
  if (i.correct === undefined) return null;
  if (
    i.type === 'performance' &&
    !fmt.supportsRange &&
    i.correct.some(([, a]) => stepRange(a))
  ) {
    return null;
  }
  if (isList(i)) return [encodeItems(i, 'correct', fmt)];
  switch (i.type) {
    case 'true-false':
      return [[fmt.formatBoolean(i.correct as boolean)]];
    case 'fill-in':
    case 'long-fill-in': {
      const prefix = fmt.supportsCasePrefix && i.caseMatters ? CASE_PREFIX : '';
      const answers = (i.correct as string[]).map((a) => prefix + a);
      return i.type === 'fill-in'
        ? answers.map((a) => a.split(fmt.itemDelim))
        : answers.map((a) => [a]);
    }
    case 'numeric': {
      const { min, max } = i.correct;
      if (min !== undefined && min === max) return [[String(min)]];
      if (!fmt.supportsRange) return null;
      return [[`${min ?? ''}${fmt.rangeDelim}${max ?? ''}`]];
    }
    case 'likert':
      return [[fmt.responseId(i.correct as string)]];
    case 'other':
      return [[i.correct as string]];
  }
}

/** Throws when the format cannot encode a value. */
export function formatResponse(i: Interaction, fmt: InteractionFormat): string {
  return responseItems(i, fmt).join(fmt.itemDelim);
}

/**
 * Returns null when no correct pattern was provided. Throws when the format
 * cannot encode a value.
 */
export function formatCorrectPattern(
  i: Interaction,
  fmt: InteractionFormat,
): string[] | null {
  return (
    correctItems(i, fmt)?.map((items) => items.join(fmt.itemDelim)) ?? null
  );
}

const STEP_DELIM = /\[[,.:]\]/;

/**
 * Checks a value's encoded items against the format's rules for its type.
 * Throws when the field cannot be recorded; returns the rule a correct answer
 * breaks when only that answer is dropped.
 */
function checkItems(
  type: Interaction['type'],
  field: 'response' | 'correct',
  items: string[],
  fmt: InteractionFormat,
): 'maxParts' | 'trimmed' | 'unique' | undefined {
  const rule: AnswerRule | undefined = fmt.rules?.[type]?.[field];
  if (!rule) return;
  if (rule.steps) {
    for (const step of items) {
      if (step === fmt.pairDelim) {
        throw new UnrecordableError(
          'a step has neither a name nor an answer, which this export standard rejects',
        );
      }
      const answer = step.slice(
        step.indexOf(fmt.pairDelim) + fmt.pairDelim.length,
      );
      if (
        STEP_DELIM.test(answer) &&
        !(rule.steps === 'range' && stepRange(answer))
      ) {
        throw new UnrecordableError(
          `the step answer "${answer}" holds [,], [.] or [:], which this export standard reads as a delimiter`,
        );
      }
    }
  }
  if (rule.nonEmpty && items.length === 0) {
    throw new UnrecordableError(
      'it has no items, which this export standard rejects',
    );
  }
  const { maxItems = Infinity, maxParts = Infinity } = rule;
  if (items.length > maxItems) {
    throw new UnrecordableError(
      `it has ${items.length} items, more than the ${maxItems} this export standard records`,
    );
  }
  if (rule.trimmed && items.some((item) => item.trim() !== item)) {
    return 'trimmed';
  }
  if (rule.unique && new Set(items).size < items.length) return 'unique';
  if (items.length > maxParts) {
    if (field === 'correct') return 'maxParts';
    throw new UnrecordableError(
      `it has ${items.length} [,]-separated parts, more than the ${maxParts} this export standard records`,
    );
  }
}

/** SCORM 1.2 has no `long-fill-in` or `other` — both fall back to `fill-in`. */
export function scorm12Type(type: Interaction['type']): string {
  switch (type) {
    case 'long-fill-in':
    case 'other':
      return 'fill-in';
    default:
      return type;
  }
}

export interface ScormInteractionSpec {
  responseField: 'student_response' | 'learner_response';
  timestampField: 'time' | 'timestamp';
  timestamp: string;
  typeValue: string;
  resultLabels: { correct: string; incorrect: string };
  format: InteractionFormat;
}

/** Ids recorded through `responseId`, grouped so ids in one group must stay distinct. */
function responseIdGroups(i: Interaction, fmt: InteractionFormat): string[][] {
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return recordsIndex(i.options, fmt)
        ? []
        : [[...i.response, ...(i.correct ?? [])]];
    case 'matching': {
      if (recordsIndex(i.optionPairs, fmt)) return [];
      const pairs = [...i.response, ...(i.correct ?? [])];
      return [pairs.map(([l]) => l), pairs.map(([, r]) => r)];
    }
    case 'performance':
      return [
        [...i.response, ...(i.correct ?? [])]
          .map(([step]) => step)
          .filter((step) => stepName(step, fmt) !== ''),
      ];
    case 'likert':
      return [[i.response, i.correct ?? i.response]];
    default:
      return [];
  }
}

/** Two distinct ids that record as the same id, and that id. */
function mergedIds(
  groups: string[][],
  fmt: InteractionFormat,
): [string, string, string] | undefined {
  for (const ids of groups) {
    const seen = new Map<string, string>();
    for (const id of ids) {
      const recorded = fmt.responseId(id);
      const first = seen.get(recorded) ?? id;
      if (first !== id) return [first, id, recorded];
      seen.set(recorded, id);
    }
  }
}

/**
 * Formats the correct patterns, drops those over the format's length cap,
 * since a shortened pattern matches nothing, then keeps the first ones up to
 * its count cap. Each warning completes a sentence whose subject is the
 * question. Throws when the format cannot record a value.
 */
export function fitPatterns(
  i: Interaction,
  fmt: InteractionFormat,
  recorder = 'this export standard',
): { kept: string[]; warnings: string[] } {
  const lost = 'graded but left out of the LMS record';
  if (
    i.type === 'performance' &&
    i.correct &&
    hasLongStep(i.correct, fmt.maxStepAnswerLength)
  ) {
    return {
      kept: [],
      warnings: [
        `has a correct step answer over the ${fmt.maxStepAnswerLength} characters ${recorder} records; the correct answer is ${lost}`,
      ],
    };
  }
  if (fmt.supportsRange && reversedRange(i)) {
    return {
      kept: [],
      warnings: [
        `has a correct range with its minimum above its maximum, which no answer can match; the correct answer is ${lost}`,
      ],
    };
  }
  const answers = correctItems(i, fmt) ?? [];
  const broken = answers.map((it) => checkItems(i.type, 'correct', it, fmt));
  const reasons: Record<NonNullable<(typeof broken)[number]>, string> = {
    trimmed: isList(i)
      ? 'with an item starting or ending in whitespace'
      : i.type === 'fill-in'
        ? 'starting or ending in whitespace, or with whitespace beside [,]'
        : 'starting or ending in whitespace',
    unique: `repeating ${i.type === 'fill-in' ? 'a [,]-separated part' : 'an item'}`,
    maxParts: `with more than ${fmt.rules?.[i.type]?.correct?.maxParts} [,]-separated parts`,
  };
  const warnings: string[] = [];
  for (const [rule, reason] of Object.entries(reasons)) {
    const dropped = broken.filter((b) => b === rule).length;
    if (dropped) {
      warnings.push(
        `has ${dropped} correct answer(s) ${reason}, which ${recorder} rejects; they are ${lost}`,
      );
    }
  }
  const patterns = answers
    .filter((_, k) => !broken[k])
    .map((it) => it.join(fmt.itemDelim));
  const max = fmt.maxValueLength(i.type);
  const limit =
    i.type === 'long-fill-in' ? fmt.longFillInLimit : fmt.fillInLimit;
  // Counts a `{case_matters=true}` prefix too, as scorm-again does.
  const fit = patterns.filter((p) => p.length <= max);
  if (fit.length < patterns.length) {
    const prefix = patterns.some(
      (p) =>
        p.length > max &&
        p.startsWith(CASE_PREFIX) &&
        p.length - CASE_PREFIX.length <= max,
    )
      ? `, counting the ${CASE_PREFIX} prefix of a case-sensitive answer`
      : '';
    warnings.push(
      `has ${patterns.length - fit.length} correct answer(s) over the ${max} characters ${recorder} records${prefix}; they are ${lost}`,
    );
  }
  if (fit.length > limit) {
    const counted =
      fit.length < patterns.length ? ' short enough to record,' : '';
    warnings.push(
      `has ${fit.length} correct answers${counted} but ${recorder} records at most ${limit}; the rest are ${lost}`,
    );
  }
  return { kept: fit.slice(0, limit), warnings };
}

function hasLongStep(
  steps: Array<[string, string | number]>,
  max: number,
): boolean {
  return steps.some(([, a]) => String(a).length > max);
}

/**
 * The leading items that fit whole in `max`, joined. Walks the items rather
 * than searching the joined value, since an item can hold the delimiter.
 */
function wholeItems(items: string[], delim: string, max: number): string {
  let kept = '';
  for (const [k, item] of items.entries()) {
    const next = k ? `${kept}${delim}${item}` : item;
    if (next.length > max) break;
    kept = next;
  }
  return kept;
}

/** Cuts on a character boundary, so an emoji or accented letter stays whole. */
function cutText(value: string, max: number): string {
  // Firefox before 125 has no Intl.Segmenter; there, only keep surrogate pairs whole.
  if (typeof Intl.Segmenter !== 'function') {
    const cut = value.slice(0, max);
    return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
  }
  let end = 0;
  for (const { index, segment } of new Intl.Segmenter().segment(value)) {
    if (index + segment.length > max) break;
    end = index + segment.length;
  }
  return value.slice(0, end);
}

/**
 * Cuts a response to the format's length caps. A list keeps only whole items,
 * since a half-written id or pair is wrong data, but a performance response
 * whose first step doesn't fit keeps that step with its answer cut. Null when
 * nothing fits.
 */
function fitResponse(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): string | null {
  const stepMax = fmt.maxStepAnswerLength;
  let longStep = false;
  if (i.type === 'performance' && hasLongStep(i.response, stepMax)) {
    longStep = true;
    i = {
      ...i,
      response: i.response.map(([step, a]): [string, string | number] => [
        step,
        typeof a === 'string' ? cutText(a, stepMax) : a,
      ]),
    };
  }
  const items = responseItems(i, fmt);
  checkItems(i.type, 'response', items, fmt);
  if (longStep) {
    console.warn(
      `Tessera: interaction "${questionId}" has a step answer over the ${stepMax} characters this export standard records; the LMS gets its first ${stepMax} characters.`,
    );
  }
  const value = items.join(fmt.itemDelim);
  const max = fmt.maxValueLength(i.type);
  if (value.length <= max) return value;
  const list = isList(i);
  const whole = list ? wholeItems(items, fmt.itemDelim, max) : '';
  const cut =
    !list || (!whole && i.type === 'performance') ? cutText(value, max) : whole;
  console.warn(
    `Tessera: the response of interaction "${questionId}" is ${value.length} characters but this export standard records at most ${max}; ${cut ? `the LMS gets the first ${cut.length} characters` : 'it is left out of the LMS record'}.`,
  );
  return cut || null;
}

function warnResponseIds(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): void {
  const groups = responseIdGroups(i, fmt);
  const ids = groups.flat();
  if (fmt.encodesOptionIndex && i.type === 'likert') {
    // Values from different learners can merge too, so this warns on any change
    // and stands in for the merge warning.
    const changed = ids.find((v) => fmt.responseId(v) !== v);
    if (changed !== undefined) {
      console.warn(
        `Tessera: interaction "${questionId}" records the likert value "${changed}" as "${fmt.responseId(changed)}" on SCORM 1.2, so values that differ only in punctuation record the same. Send values of letters, digits and underscores.`,
      );
    }
    return;
  }
  if (fmt.encodesOptionIndex && i.type !== 'performance') {
    const invalid = ids.find((id) => !/^[0-9a-z]$/.test(fmt.responseId(id)));
    if (invalid !== undefined) {
      console.warn(
        `Tessera: interaction "${questionId}" sends the id "${invalid}" without options; SCORM 1.2 allows one character (0-9, a-z) per id, so strict LMSs reject it. Pass options to record each id as its position.`,
      );
    }
  } else {
    const long = ids.find(
      (id) => fmt.responseId(id, Infinity) !== fmt.responseId(id),
    );
    if (long !== undefined) {
      console.warn(
        `Tessera: interaction "${questionId}" records the id "${long}" cut to the 250 characters this export standard allows, so the LMS record loses its end. Give it a shorter id.`,
      );
    }
  }
  const merged = mergedIds(groups, fmt);
  if (merged) {
    const [a, b, recorded] = merged;
    console.warn(
      `Tessera: interaction "${questionId}" records the ids "${a}" and "${b}" both as "${recorded}", so the LMS record cannot tell them apart. Give them ids that differ in letters or digits.`,
    );
  }
}

export function buildScormInteractionFields(
  questionId: string,
  interaction: Interaction,
  correct: boolean | null,
  spec: ScormInteractionSpec,
): { id: string; fields: Array<[string, string]> } {
  const fields: Array<[string, string]> = [['type', spec.typeValue]];
  warnResponseIds(questionId, interaction, spec.format);
  const recordable = <T>(field: string, format: () => T): T | null => {
    try {
      return format();
    } catch (err) {
      if (!(err instanceof UnrecordableError)) throw err;
      console.warn(
        `Tessera: the ${field} of interaction "${questionId}" is left out of the LMS record: ${err.message}.`,
      );
      return null;
    }
  };
  const patterns = recordable('correct answer', () => {
    const { kept, warnings } = fitPatterns(interaction, spec.format);
    for (const warning of warnings) {
      console.warn(`Tessera: interaction "${questionId}" ${warning}.`);
    }
    return kept;
  });
  const response = recordable('response', () =>
    fitResponse(questionId, interaction, spec.format),
  );
  patterns?.forEach((pattern, n) => {
    fields.push([`correct_responses.${n}.pattern`, pattern]);
  });
  if (response !== null) fields.push([spec.responseField, response]);
  if (correct !== null) {
    fields.push([
      'result',
      correct ? spec.resultLabels.correct : spec.resultLabels.incorrect,
    ]);
  }
  fields.push([spec.timestampField, spec.timestamp]);
  return { id: spec.format.identifier(questionId), fields };
}
