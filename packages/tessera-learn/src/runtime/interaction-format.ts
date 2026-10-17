/**
 * SCORM 1.2 RTE §3.4.7 vs SCORM 2004 4E RTE §4.2.7 differ in delimiter
 * encoding and identifier rules; cmi5 (xAPI) reuses 2004's delimiters but
 * not its identifier slugging.
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
   * `fill-in` and 1 for `long-fill-in`; xAPI has no such limit.
   */
  fillInLimit: number;
  longFillInLimit: number;
  /**
   * SCORM 1.2 caps every CMIFeedback value (`student_response` and each
   * `correct_responses` pattern) at 255 characters; strict LMSs reject a
   * longer one with 405.
   */
  maxValueLength: number;
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
  maxValueLength: 255,
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
  maxValueLength: Infinity,
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
};

// xAPI reuses SCORM 2004's delimiters, numeric-range support, and identity
// identifier, but the RTE caps on `correct_responses` are SCORM-only.
export const XAPI_INTERACTION_FORMAT: InteractionFormat = {
  ...SCORM2004_INTERACTION_FORMAT,
  fillInLimit: Infinity,
  longFillInLimit: Infinity,
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
      const limit =
        i.type === 'long-fill-in' ? fmt.longFillInLimit : fmt.fillInLimit;
      const all = i.correct as string[];
      if (all.length > limit) {
        console.warn(
          `Tessera: ${i.type} declares ${all.length} correct answers but this export standard records at most ${limit}; the rest are graded locally but absent from the LMS record.`,
        );
      }
      const alternatives = all.slice(0, limit);
      if (!fmt.supportsCasePrefix) return alternatives;
      const prefix = i.caseMatters ? '{case_matters=true}' : '';
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

const LIST_TYPES = new Set<Interaction['type']>([
  'choice',
  'sequencing',
  'matching',
  'performance',
]);

/**
 * Cuts a response to the format's length cap. A list keeps only whole items,
 * since a half-written id or pair is wrong data. Null when nothing fits.
 */
function fitResponse(
  questionId: string,
  type: Interaction['type'],
  value: string,
  fmt: InteractionFormat,
): string | null {
  const max = fmt.maxValueLength;
  if (value.length <= max) return value;
  let cut: string;
  if (LIST_TYPES.has(type)) {
    cut = value.slice(0, Math.max(value.lastIndexOf(fmt.itemDelim, max), 0));
  } else {
    cut = value.slice(0, max);
    // Don't leave half of a surrogate pair (an emoji) at the end.
    if (/[\uD800-\uDBFF]$/.test(cut)) cut = cut.slice(0, -1);
  }
  console.warn(
    `Tessera: the response of interaction "${questionId}" is ${value.length} characters but this export standard records at most ${max}; ${cut ? `the LMS gets the first ${cut.length}` : 'it is left out of the LMS record'}.`,
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
  const max = spec.format.maxValueLength;
  const patterns = recordable('correct answer', () =>
    formatCorrectPattern(interaction, spec.format),
  );
  const response = recordable('response', () =>
    formatResponse(interaction, spec.format),
  );
  const keptPatterns = patterns?.filter((p) => p.length <= max) ?? [];
  if (patterns && keptPatterns.length < patterns.length) {
    console.warn(
      `Tessera: interaction "${questionId}" has ${patterns.length - keptPatterns.length} correct answer(s) over the ${max} characters this export standard records; they are graded locally but absent from the LMS record.`,
    );
  }
  keptPatterns.forEach((pattern, n) => {
    fields.push([`correct_responses.${n}.pattern`, pattern]);
  });
  const recorded =
    response === null
      ? null
      : fitResponse(questionId, interaction.type, response, spec.format);
  if (recorded !== null) fields.push([spec.responseField, recorded]);
  if (correct !== null) {
    fields.push([
      'result',
      correct ? spec.resultLabels.correct : spec.resultLabels.incorrect,
    ]);
  }
  fields.push([spec.timestampField, spec.timestamp]);
  return { id: spec.format.identifier(questionId), fields };
}
