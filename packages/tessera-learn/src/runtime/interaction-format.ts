/**
 * SCORM 1.2 RTE §3.4.7 vs SCORM 2004 4E RTE §4.2.7 differ in delimiter
 * encoding and identifier rules; cmi5 and xAPI reuse 2004's encoding
 * without its caps.
 */

import type { Interaction } from './interaction.js';

export interface InteractionFormat {
  itemDelim: string;
  pairDelim: string;
  rangeDelim: string;
  /**
   * SCORM 1.2 has no numeric range syntax — `correct_responses.n.pattern`
   * is a single CMIDecimal. SCORM 2004 supports `min[:]max`.
   */
  supportsNumericRange: boolean;
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
  /** SCORM 2004 records an unnamed step as `[.]answer`; SCORM 1.2 records `_`. */
  keepsUnnamedStep: boolean;
  /**
   * SCORM 2004 parses `[,]`, `[.]` and `[:]` inside a step answer as
   * delimiters, so it rejects an answer holding one (a correct `min[:]max`
   * range aside).
   */
  rejectsDelimInStepAnswer: boolean;
  formatBoolean(value: boolean): string;
  identifier(value: string): string;
  /** Ids inside a response: list items, matching ids, step names, likert. */
  responseId(value: string): string;
}

export const SCORM12_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: ',',
  pairDelim: '.',
  rangeDelim: ':',
  supportsNumericRange: false,
  supportsCasePrefix: false,
  encodesOptionIndex: true,
  fillInLimit: 10,
  longFillInLimit: 10,
  maxValueLength: () => 255,
  maxStepAnswerLength: Infinity,
  keepsUnnamedStep: false,
  rejectsDelimInStepAnswer: false,
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
  supportsNumericRange: true,
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
  keepsUnnamedStep: true,
  rejectsDelimInStepAnswer: true,
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
  rejectsDelimInStepAnswer: false,
  responseId: (v) => v,
};

/**
 * SCORM `short_identifier_type` / `CMIIdentifier`: alphanumerics +
 * underscore, max 250 chars. Strict validators (SCORM Cloud) reject raw
 * option labels with spaces or punctuation with error 405/406.
 */
export function shortIdentifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const trimmed = cleaned.slice(0, 250);
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
function uriIdentifier(value: string): string {
  let id = '';
  for (const c of value.replace(/\p{Cs}/gu, '\uFFFD')) {
    const encoded = URI_ID_CHAR.test(c)
      ? c
      : encodeURIComponent(c).replace('~', '%7E');
    if (id.length + encoded.length > 250) break;
    id += encoded;
  }
  if (/\w/.test(id)) return id;
  const escaped = id.replace(
    /./g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return escaped.slice(0, 249) || '_';
}

export const SCORM12_MAX_OPTIONS = 36;

const CASE_PREFIX = '{case_matters=true}';

/** A value the format cannot record, so its field is left out of the LMS record. */
class UnrecordableError extends Error {}

/**
 * SCORM 1.2 CMIFeedback takes one character per choice or matching id
 * (0-9, a-z), so an index encodes as one base-36 digit.
 */
function encodeListItem(
  value: string,
  options: string[] | undefined,
  fmt: InteractionFormat,
): string {
  if (!fmt.encodesOptionIndex || !options) return fmt.responseId(value);
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
  return step === '' && fmt.keepsUnnamedStep ? '' : fmt.responseId(step);
}

const STEP_DELIM = /\[[,.:]\]/;
const NUMERIC_RANGE = /^(-?\d+(\.\d+)?)?\[:\](-?\d+(\.\d+)?)?$/;

/** Step names are identifiers; step answers are free text, kept as written. */
function encodeStep(
  [step, a]: [string, string | number],
  field: 'response' | 'correct',
  fmt: InteractionFormat,
): string {
  const answer = String(a);
  if (
    fmt.rejectsDelimInStepAnswer &&
    STEP_DELIM.test(answer) &&
    !(field === 'correct' && NUMERIC_RANGE.test(answer))
  ) {
    throw new UnrecordableError(
      `the step answer "${answer}" holds [,], [.] or [:], which this export standard reads as a delimiter`,
    );
  }
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

/** The response's or correct answer's encoded items, not yet joined. */
function encodeItems(
  i: ListInteraction,
  field: 'response' | 'correct',
  fmt: InteractionFormat,
): string[] {
  switch (i.type) {
    case 'choice':
      // A choice response is a set; SCORM 2004 rejects one that repeats an id.
      return [
        ...new Set(
          (i[field] ?? []).map((v) => encodeListItem(v, i.options, fmt)),
        ),
      ];
    case 'sequencing':
      return (i[field] ?? []).map((v) => encodeListItem(v, i.options, fmt));
    case 'matching':
      return (i[field] ?? []).map((p) => encodePair(p, i.optionPairs, fmt));
    case 'performance':
      return (i[field] ?? []).map((s) => encodeStep(s, field, fmt));
  }
}

/** Throws when the format cannot record a value. */
export function formatResponse(i: Interaction, fmt: InteractionFormat): string {
  if (isList(i)) return encodeItems(i, 'response', fmt).join(fmt.itemDelim);
  switch (i.type) {
    case 'true-false':
      return fmt.formatBoolean(i.response);
    case 'fill-in':
    case 'long-fill-in':
    case 'other':
      return i.response;
    case 'likert':
      return fmt.responseId(i.response);
    case 'numeric':
      return String(i.response);
  }
}

/**
 * Returns null when no correct pattern was provided. Throws when the format
 * cannot record a value.
 */
export function formatCorrectPattern(
  i: Interaction,
  fmt: InteractionFormat,
): string[] | null {
  if (i.correct === undefined) return null;
  if (isList(i)) return [encodeItems(i, 'correct', fmt).join(fmt.itemDelim)];
  switch (i.type) {
    case 'true-false':
      return [fmt.formatBoolean(i.correct as boolean)];
    case 'fill-in':
    case 'long-fill-in': {
      const alternatives = i.correct as string[];
      if (!fmt.supportsCasePrefix) return alternatives;
      const prefix = i.caseMatters ? CASE_PREFIX : '';
      return alternatives.map((a) => prefix + a);
    }
    case 'numeric': {
      const c = i.correct as { min?: number; max?: number };
      if (c.min !== undefined && c.max !== undefined && c.min === c.max) {
        return [String(c.min)];
      }
      if (c.min !== undefined && c.max === undefined) return [String(c.min)];
      if (c.min === undefined && c.max !== undefined) return [String(c.max)];
      // True range — drop the pattern in 1.2 (rely on `result` for pass/fail).
      if (!fmt.supportsNumericRange) return null;
      return [`${c.min ?? ''}${fmt.rangeDelim}${c.max ?? ''}`];
    }
    case 'likert':
      return [fmt.responseId(i.correct as string)];
    case 'other':
      return [i.correct as string];
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
      return fmt.encodesOptionIndex && i.options
        ? []
        : [[...i.response, ...(i.correct ?? [])]];
    case 'matching': {
      if (fmt.encodesOptionIndex && i.optionPairs) return [];
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
  i: Interaction,
  fmt: InteractionFormat,
): [string, string, string] | undefined {
  for (const ids of responseIdGroups(i, fmt)) {
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
  const patterns = formatCorrectPattern(i, fmt) ?? [];
  const max = fmt.maxValueLength(i.type);
  const limit =
    i.type === 'long-fill-in' ? fmt.longFillInLimit : fmt.fillInLimit;
  const warnings: string[] = [];
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
  if (i.type === 'performance' && hasLongStep(i.response, stepMax)) {
    console.warn(
      `Tessera: interaction "${questionId}" has a step answer over the ${stepMax} characters this export standard records; the LMS gets its first ${stepMax} characters.`,
    );
    i = {
      ...i,
      response: i.response.map(([step, a]): [string, string | number] => [
        step,
        typeof a === 'string' ? cutText(a, stepMax) : a,
      ]),
    };
  }
  const items = isList(i) ? encodeItems(i, 'response', fmt) : null;
  const value = items ? items.join(fmt.itemDelim) : formatResponse(i, fmt);
  const max = fmt.maxValueLength(i.type);
  if (value.length <= max) return value;
  const whole = items ? wholeItems(items, fmt.itemDelim, max) : '';
  const cut =
    !items || (!whole && i.type === 'performance')
      ? cutText(value, max)
      : whole;
  console.warn(
    `Tessera: the response of interaction "${questionId}" is ${value.length} characters but this export standard records at most ${max}; ${cut ? `the LMS gets the first ${cut.length} characters` : 'it is left out of the LMS record'}.`,
  );
  return cut || null;
}

export function buildScormInteractionFields(
  questionId: string,
  interaction: Interaction,
  correct: boolean | null,
  spec: ScormInteractionSpec,
): { id: string; fields: Array<[string, string]> } {
  const fields: Array<[string, string]> = [['type', spec.typeValue]];
  const { type } = interaction;
  const invalid =
    spec.format.encodesOptionIndex &&
    (type === 'choice' || type === 'sequencing' || type === 'matching')
      ? responseIdGroups(interaction, spec.format)
          .flat()
          .find((id) => !/^[0-9a-z]$/.test(spec.format.responseId(id)))
      : undefined;
  const merged = mergedIds(interaction, spec.format);
  if (invalid !== undefined) {
    console.warn(
      `Tessera: interaction "${questionId}" sends the id "${invalid}" without options; SCORM 1.2 allows one character (0-9, a-z) per id, so strict LMSs reject it. Pass options to record each id as its position.`,
    );
  } else if (merged) {
    const [a, b, recorded] = merged;
    console.warn(
      `Tessera: interaction "${questionId}" records the ids "${a}" and "${b}" both as "${recorded}", so the LMS record cannot tell them apart. Give them ids that differ in letters or digits.`,
    );
  }
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
