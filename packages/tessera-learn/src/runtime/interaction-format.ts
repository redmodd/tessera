/**
 * Format `Interaction` payloads for SCORM 1.2 / SCORM 2004 / xAPI
 * `cmi.interactions.n.*` writes.
 *
 * SCORM 1.2 (RTE §3.4.7) uses plain `,` and `.` as item/pair delimiters,
 * restricts identifier values to alphanumerics, and accepts `t`/`f` (or
 * `0`/`1`) for `true-false` responses.
 *
 * SCORM 2004 4th Edition (RTE §4.2.7) uses bracketed literals so an
 * identifier may itself contain commas — `cmi5` (xAPI) reuses the same
 * encoding for its `cmi.interaction` activity statements:
 *
 *   ITEM delimiter   [,]
 *   PAIR delimiter   [.]
 *   RANGE delimiter  [:]
 */

import type { Interaction } from './interaction.js';

/** Per-dialect delimiters + identifier sanitization. */
export interface InteractionFormat {
  /** Separator between list items (e.g. choice ids). */
  itemDelim: string;
  /** Separator inside a pair (matching/performance). */
  pairDelim: string;
  /** Range separator for numeric `correct` patterns. */
  rangeDelim: string;
  /** Format a boolean response for `true-false`. */
  formatBoolean(value: boolean): string;
  /** Sanitize an identifier so it satisfies the dialect's data-type rules. */
  identifier(value: string): string;
}

/**
 * SCORM 1.2 RTE §3.4.7 `student_response` / `correct_responses.0.pattern`
 * encoding. Identifiers must be alphanumeric (1-250 chars).
 */
export const SCORM12_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: ',',
  pairDelim: '.',
  rangeDelim: ':',
  formatBoolean: (v) => (v ? 't' : 'f'),
  identifier: cmi12Identifier,
};

/**
 * SCORM 2004 4E RTE §4.2.7 / xAPI `cmi.interaction` encoding. The bracketed
 * delimiters are literal text, not regex; xAPI consumers parse them the same
 * way.
 */
export const SCORM2004_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: '[,]',
  pairDelim: '[.]',
  rangeDelim: '[:]',
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
};

/**
 * Slug an arbitrary string into a SCORM 1.2 `CMIIdentifier` — alphanumerics
 * only, max 250 chars. Authors typically pass option labels ("88 Earth
 * days") which the strict 1.2 validator (e.g. SCORM Cloud) rejects with
 * error 405 unless reduced to this character set.
 */
function cmi12Identifier(value: string): string {
  const cleaned = value.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const trimmed = cleaned.slice(0, 250);
  return trimmed || '_';
}

/**
 * Serialize the learner response to the `learner_response` / `student_response`
 * field format expected by the target dialect.
 */
export function formatResponse(
  i: Interaction,
  fmt: InteractionFormat = SCORM2004_INTERACTION_FORMAT
): string {
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return i.response.map(fmt.identifier).join(fmt.itemDelim);
    case 'true-false':
      return fmt.formatBoolean(i.response);
    case 'fill-in':
    case 'long-fill-in':
    case 'likert':
    case 'other':
      return i.response;
    case 'matching':
      return i.response
        .map(([l, r]) => `${fmt.identifier(l)}${fmt.pairDelim}${fmt.identifier(r)}`)
        .join(fmt.itemDelim);
    case 'numeric':
      return String(i.response);
    case 'performance':
      return i.response
        .map(([s, v]) => `${fmt.identifier(s)}${fmt.pairDelim}${fmt.identifier(String(v))}`)
        .join(fmt.itemDelim);
  }
}

/**
 * Serialize the `correct_responses.0.pattern` for this interaction. Returns
 * `null` if no correct pattern was provided.
 */
export function formatCorrectPattern(
  i: Interaction,
  fmt: InteractionFormat = SCORM2004_INTERACTION_FORMAT
): string | null {
  if (i.correct === undefined) return null;
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return (i.correct as string[]).map(fmt.identifier).join(fmt.itemDelim);
    case 'true-false':
      return fmt.formatBoolean(i.correct as boolean);
    case 'fill-in':
    case 'long-fill-in':
      return (i.correct as string[]).join(fmt.itemDelim);
    case 'matching':
      return (i.correct as Array<[string, string]>)
        .map(([l, r]) => `${fmt.identifier(l)}${fmt.pairDelim}${fmt.identifier(r)}`)
        .join(fmt.itemDelim);
    case 'numeric': {
      const c = i.correct as { min?: number; max?: number };
      const min = c.min ?? '';
      const max = c.max ?? '';
      return `${min}${fmt.rangeDelim}${max}`;
    }
    case 'likert':
    case 'other':
      return i.correct as string;
    case 'performance':
      return (i.correct as Array<[string, string | number]>)
        .map(([s, v]) => `${fmt.identifier(s)}${fmt.pairDelim}${fmt.identifier(String(v))}`)
        .join(fmt.itemDelim);
  }
}

/**
 * Map Tessera interaction types to SCORM 1.2's narrower vocabulary. SCORM 1.2
 * does not define `long-fill-in`; fall back to `fill-in`. `other` is not in
 * the spec either — fall back to `fill-in` (free text).
 */
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

/**
 * Per-standard differences in how `cmi.interactions.n.*` is written. The
 * SCORM 1.2 vs 2004 deltas are: response field name, result vocabulary,
 * timestamp field name+format, the type vocabulary mapping, and the
 * response-encoding rules (delimiters, identifier sanitization, true-false
 * representation).
 */
export interface ScormInteractionSpec {
  responseField: 'student_response' | 'learner_response';
  timestampField: 'time' | 'timestamp';
  /** Wall-clock value formatted to whichever style the standard expects. */
  timestamp: string;
  /** Mapped interaction type — already narrowed for SCORM 1.2 callers. */
  typeValue: string;
  resultLabels: { correct: string; incorrect: string };
  /** Encoding scheme for response/pattern values. */
  format: InteractionFormat;
}

/**
 * Build the ordered list of `cmi.interactions.n.*` writes that SCORM 1.2 and
 * SCORM 2004 adapters share. Caller wires each pair through its own LMS
 * SetValue queue (the queueing semantics differ between adapters).
 */
export function buildScormInteractionFields(
  prefix: string,
  questionId: string,
  interaction: Interaction,
  correct: boolean | null,
  spec: ScormInteractionSpec
): Array<[string, string]> {
  const fields: Array<[string, string]> = [
    [`${prefix}.id`, questionId],
    [`${prefix}.type`, spec.typeValue],
    [`${prefix}.${spec.responseField}`, formatResponse(interaction, spec.format)],
  ];
  const pattern = formatCorrectPattern(interaction, spec.format);
  if (pattern !== null) {
    fields.push([`${prefix}.correct_responses.0.pattern`, pattern]);
  }
  if (correct !== null) {
    fields.push([
      `${prefix}.result`,
      correct ? spec.resultLabels.correct : spec.resultLabels.incorrect,
    ]);
  }
  fields.push([`${prefix}.${spec.timestampField}`, spec.timestamp]);
  return fields;
}
