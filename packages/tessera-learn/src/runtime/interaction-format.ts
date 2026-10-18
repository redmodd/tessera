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
  formatBoolean(value: boolean): string;
  identifier(value: string): string;
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
  formatBoolean: (v) => (v ? 't' : 'f'),
  identifier: shortIdentifier,
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
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
};

export const XAPI_INTERACTION_FORMAT: InteractionFormat = {
  ...SCORM2004_INTERACTION_FORMAT,
  fillInLimit: Infinity,
  longFillInLimit: Infinity,
  maxValueLength: () => Infinity,
  maxStepAnswerLength: Infinity,
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

export const SCORM12_MAX_OPTIONS = 36;

const CASE_PREFIX = '{case_matters=true}';

/** An id SCORM 1.2 cannot record as a one-character option index. */
class UnencodableOptionError extends Error {}

/**
 * SCORM 1.2 CMIFeedback takes one character per choice or matching id
 * (0-9, a-z), so an index encodes as one base-36 digit.
 */
function encodeListItem(
  value: string,
  options: string[] | undefined,
  fmt: InteractionFormat,
): string {
  if (!fmt.encodesOptionIndex || !options) return fmt.identifier(value);
  const idx = options.indexOf(value);
  if (idx < 0) {
    throw new UnencodableOptionError(`"${value}" is not in its options`);
  }
  if (idx >= SCORM12_MAX_OPTIONS) {
    throw new UnencodableOptionError(
      `option ${idx + 1} is past the ${SCORM12_MAX_OPTIONS} options SCORM 1.2 can record`,
    );
  }
  return idx.toString(36);
}

function encodeIds(
  values: string[],
  options: string[] | undefined,
  fmt: InteractionFormat,
): string {
  return values.map((v) => encodeListItem(v, options, fmt)).join(fmt.itemDelim);
}

function encodePairs(
  pairs: Array<[string, string | number]>,
  optionPairs: { left: string[]; right: string[] } | undefined,
  fmt: InteractionFormat,
): string {
  return pairs
    .map(
      ([l, r]) =>
        `${encodeListItem(l, optionPairs?.left, fmt)}${fmt.pairDelim}${encodeListItem(String(r), optionPairs?.right, fmt)}`,
    )
    .join(fmt.itemDelim);
}

/** Throws when SCORM 1.2 cannot encode an option. */
export function formatResponse(
  i: Interaction,
  fmt: InteractionFormat = SCORM2004_INTERACTION_FORMAT,
): string {
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return encodeIds(i.response, i.options, fmt);
    case 'true-false':
      return fmt.formatBoolean(i.response);
    case 'fill-in':
    case 'long-fill-in':
    case 'likert':
    case 'other':
      return i.response;
    case 'matching':
      return encodePairs(i.response, i.optionPairs, fmt);
    case 'numeric':
      return String(i.response);
    case 'performance':
      return encodePairs(i.response, undefined, fmt);
  }
}

/**
 * Returns null when no correct pattern was provided. Throws when SCORM 1.2
 * cannot encode an option.
 */
export function formatCorrectPattern(
  i: Interaction,
  fmt: InteractionFormat = SCORM2004_INTERACTION_FORMAT,
): string[] | null {
  if (i.correct === undefined) return null;
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return [encodeIds(i.correct as string[], i.options, fmt)];
    case 'true-false':
      return [fmt.formatBoolean(i.correct as boolean)];
    case 'fill-in':
    case 'long-fill-in': {
      const alternatives = i.correct as string[];
      if (!fmt.supportsCasePrefix) return alternatives;
      const prefix = i.caseMatters ? CASE_PREFIX : '';
      return alternatives.map((a) => prefix + a);
    }
    case 'matching':
      return [
        encodePairs(i.correct as Array<[string, string]>, i.optionPairs, fmt),
      ];
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
    case 'other':
      return [i.correct as string];
    case 'performance':
      return [
        encodePairs(
          i.correct as Array<[string, string | number]>,
          undefined,
          fmt,
        ),
      ];
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

function idsWithoutOptions(i: Interaction): string[] {
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return i.options ? [] : [...i.response, ...(i.correct ?? [])];
    case 'matching':
      return i.optionPairs ? [] : [...i.response, ...(i.correct ?? [])].flat();
    default:
      return [];
  }
}

/**
 * Drops correct answers over the format's length cap, since a shortened
 * pattern matches nothing, then keeps the first ones up to its count cap.
 * Each warning completes a sentence whose subject is the question.
 */
export function fitPatterns(
  i: Interaction,
  patterns: string[],
  fmt: InteractionFormat,
  recorder = 'this export standard',
): { kept: string[]; warnings: string[] } {
  const max = fmt.maxValueLength(i.type);
  const limit =
    i.type === 'long-fill-in' ? fmt.longFillInLimit : fmt.fillInLimit;
  const lost = 'graded but left out of the LMS record';
  const warnings: string[] = [];
  // Counts a `{case_matters=true}` prefix too, as scorm-again does.
  let fit = patterns.filter((p) => p.length <= max);
  if (fit.length < patterns.length) {
    const prefixed =
      'caseMatters' in i && i.caseMatters && fmt.supportsCasePrefix;
    const prefix =
      prefixed &&
      patterns.some(
        (p) => p.length > max && p.length - CASE_PREFIX.length <= max,
      )
        ? `, counting the ${CASE_PREFIX} prefix of a case-sensitive answer`
        : '';
    warnings.push(
      `has ${patterns.length - fit.length} correct answer(s) over the ${max} characters ${recorder} records${prefix}; they are ${lost}`,
    );
  }
  if (
    i.type === 'performance' &&
    i.correct?.some(([, a]) => String(a).length > fmt.maxStepAnswerLength)
  ) {
    fit = [];
    warnings.push(
      `has a correct step answer over the ${fmt.maxStepAnswerLength} characters ${recorder} records; the correct answer is ${lost}`,
    );
  }
  if (fit.length > limit) {
    warnings.push(
      `has ${fit.length} correct answers but ${recorder} records at most ${limit}; the rest are ${lost}`,
    );
  }
  return { kept: fit.slice(0, limit), warnings };
}

function cutText(value: string, max: number): string {
  const cut = value.slice(0, max);
  // Don't leave half of a surrogate pair (an emoji) at the end.
  return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
}

/**
 * Cuts a response to the format's length caps. A list keeps only whole items,
 * since a half-written id or pair is wrong data. Null when nothing fits.
 */
function fitResponse(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): string | null {
  const stepMax = fmt.maxStepAnswerLength;
  if (
    i.type === 'performance' &&
    i.response.some(([, a]) => typeof a === 'string' && a.length > stepMax)
  ) {
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
  const value = formatResponse(i, fmt);
  const max = fmt.maxValueLength(i.type);
  if (value.length <= max) return value;
  const cut = Array.isArray(i.response)
    ? value.slice(0, Math.max(value.lastIndexOf(fmt.itemDelim, max), 0))
    : cutText(value, max);
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
  if (spec.format.encodesOptionIndex) {
    const invalid = idsWithoutOptions(interaction).find(
      (id) => !/^[0-9a-z]$/.test(spec.format.identifier(id)),
    );
    if (invalid !== undefined) {
      console.warn(
        `Tessera: interaction "${questionId}" sends the id "${invalid}" without options; SCORM 1.2 allows one character (0-9, a-z) per id, so strict LMSs reject it. Pass options to record each id as its position.`,
      );
    }
  }
  const recordable = <T>(field: string, format: () => T): T | null => {
    try {
      return format();
    } catch (err) {
      if (!(err instanceof UnencodableOptionError)) throw err;
      console.warn(
        `Tessera: the ${field} of interaction "${questionId}" is left out of the LMS record: ${err.message}.`,
      );
      return null;
    }
  };
  const patterns = recordable('correct answer', () => {
    const all = formatCorrectPattern(interaction, spec.format);
    if (!all) return null;
    const { kept, warnings } = fitPatterns(interaction, all, spec.format);
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
