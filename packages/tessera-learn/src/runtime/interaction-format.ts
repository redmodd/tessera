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
  formatBoolean(value: boolean): string;
  identifier(value: string): string;
}

export const SCORM12_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: ',',
  pairDelim: '.',
  rangeDelim: ':',
  supportsNumericRange: false,
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
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
};

export const XAPI_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: '[,]',
  pairDelim: '[.]',
  rangeDelim: '[:]',
  supportsNumericRange: true,
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
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

function indexLookup(
  options: string[] | undefined,
  value: string,
): string | null {
  if (!options) return null;
  const idx = options.indexOf(value);
  return idx >= 0 ? String(idx) : null;
}

function encodeListItem(
  value: string,
  options: string[] | undefined,
  fmt: InteractionFormat,
): string {
  if (fmt === SCORM12_INTERACTION_FORMAT) {
    const idx = indexLookup(options, value);
    if (idx !== null) return idx;
  }
  return fmt.identifier(value);
}

export function formatResponse(
  i: Interaction,
  fmt: InteractionFormat = SCORM2004_INTERACTION_FORMAT,
): string {
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return i.response
        .map((v) => encodeListItem(v, i.options, fmt))
        .join(fmt.itemDelim);
    case 'true-false':
      return fmt.formatBoolean(i.response);
    case 'fill-in':
    case 'long-fill-in':
    case 'likert':
    case 'other':
      return i.response;
    case 'matching':
      return i.response
        .map(
          ([l, r]) =>
            `${encodeListItem(l, i.optionPairs?.left, fmt)}${fmt.pairDelim}${encodeListItem(r, i.optionPairs?.right, fmt)}`,
        )
        .join(fmt.itemDelim);
    case 'numeric':
      return String(i.response);
    case 'performance':
      return i.response
        .map(
          ([s, v]) =>
            `${fmt.identifier(s)}${fmt.pairDelim}${fmt.identifier(String(v))}`,
        )
        .join(fmt.itemDelim);
  }
}

/** Returns null when no correct pattern was provided. */
export function formatCorrectPattern(
  i: Interaction,
  fmt: InteractionFormat = SCORM2004_INTERACTION_FORMAT,
): string | null {
  if (i.correct === undefined) return null;
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return (i.correct as string[])
        .map((v) => encodeListItem(v, i.options, fmt))
        .join(fmt.itemDelim);
    case 'true-false':
      return fmt.formatBoolean(i.correct as boolean);
    case 'fill-in':
    case 'long-fill-in':
      return (i.correct as string[]).join(fmt.itemDelim);
    case 'matching':
      return (i.correct as Array<[string, string]>)
        .map(
          ([l, r]) =>
            `${encodeListItem(l, i.optionPairs?.left, fmt)}${fmt.pairDelim}${encodeListItem(r, i.optionPairs?.right, fmt)}`,
        )
        .join(fmt.itemDelim);
    case 'numeric': {
      const c = i.correct as { min?: number; max?: number };
      if (c.min !== undefined && c.max !== undefined && c.min === c.max) {
        return String(c.min);
      }
      if (c.min !== undefined && c.max === undefined) return String(c.min);
      if (c.min === undefined && c.max !== undefined) return String(c.max);
      // True range — drop the pattern in 1.2 (rely on `result` for pass/fail).
      if (!fmt.supportsNumericRange) return null;
      return `${c.min ?? ''}${fmt.rangeDelim}${c.max ?? ''}`;
    }
    case 'likert':
    case 'other':
      return i.correct as string;
    case 'performance':
      return (i.correct as Array<[string, string | number]>)
        .map(
          ([s, v]) =>
            `${fmt.identifier(s)}${fmt.pairDelim}${fmt.identifier(String(v))}`,
        )
        .join(fmt.itemDelim);
  }
}

/** SCORM 1.2 has no `long-fill-in` or `other` — both fall back to `fill-in`. */
export function scorm12Type(type: Interaction['type']): string {
  switch (type) {
    case 'long-fill-in':
      return 'fill-in';
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

export function buildScormInteractionFields(
  prefix: string,
  questionId: string,
  interaction: Interaction,
  correct: boolean | null,
  spec: ScormInteractionSpec,
): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    [`${prefix}.id`, spec.format.identifier(questionId)],
    [`${prefix}.type`, spec.typeValue],
  ];
  const pattern = formatCorrectPattern(interaction, spec.format);
  if (pattern !== null) {
    fields.push([`${prefix}.correct_responses.0.pattern`, pattern]);
  }
  fields.push([
    `${prefix}.${spec.responseField}`,
    formatResponse(interaction, spec.format),
  ]);
  if (correct !== null) {
    fields.push([
      `${prefix}.result`,
      correct ? spec.resultLabels.correct : spec.resultLabels.incorrect,
    ]);
  }
  fields.push([`${prefix}.${spec.timestampField}`, spec.timestamp]);
  return fields;
}
