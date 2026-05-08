/**
 * Format `Interaction` payloads for SCORM 2004 / xAPI `cmi.interactions.n.*`
 * writes. Delimiters follow SCORM 2004 4th Edition RTE §4.2.7 — `cmi5` (xAPI)
 * reuses the same encoding for `cmi.interaction` activity statements.
 *
 *   ITEM delimiter   [,]
 *   PAIR delimiter   [.]
 *   RANGE delimiter  [:]
 */

import type { Interaction } from './interaction.js';

/**
 * Serialize the learner response to the `learner_response` / `student_response`
 * field format expected by SCORM 2004 and mirrored by xAPI.
 */
export function formatResponse(i: Interaction): string {
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return i.response.join('[,]');
    case 'true-false':
      return i.response ? 'true' : 'false';
    case 'fill-in':
    case 'long-fill-in':
    case 'likert':
    case 'other':
      return i.response;
    case 'matching':
      return i.response.map(([l, r]) => `${l}[.]${r}`).join('[,]');
    case 'numeric':
      return String(i.response);
    case 'performance':
      return i.response.map(([s, v]) => `${s}[.]${v}`).join('[,]');
  }
}

/**
 * Serialize the `correct_responses.0.pattern` for this interaction. Returns
 * `null` if no correct pattern was provided.
 */
export function formatCorrectPattern(i: Interaction): string | null {
  if (i.correct === undefined) return null;
  switch (i.type) {
    case 'choice':
    case 'sequencing':
      return (i.correct as string[]).join('[,]');
    case 'true-false':
      return (i.correct as boolean) ? 'true' : 'false';
    case 'fill-in':
    case 'long-fill-in':
      // SCORM 2004 accepts multiple acceptable patterns joined with `[,]`.
      return (i.correct as string[]).join('[,]');
    case 'matching':
      return (i.correct as Array<[string, string]>).map(([l, r]) => `${l}[.]${r}`).join('[,]');
    case 'numeric': {
      const c = i.correct as { min?: number; max?: number };
      const min = c.min ?? '';
      const max = c.max ?? '';
      return `${min}[:]${max}`;
    }
    case 'likert':
    case 'other':
      return i.correct as string;
    case 'performance':
      return (i.correct as Array<[string, string | number]>)
        .map(([s, v]) => `${s}[.]${v}`)
        .join('[,]');
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
 * timestamp field name+format, and the type vocabulary mapping.
 */
export interface ScormInteractionSpec {
  responseField: 'student_response' | 'learner_response';
  timestampField: 'time' | 'timestamp';
  /** Wall-clock value formatted to whichever style the standard expects. */
  timestamp: string;
  /** Mapped interaction type — already narrowed for SCORM 1.2 callers. */
  typeValue: string;
  resultLabels: { correct: string; incorrect: string };
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
    [`${prefix}.${spec.responseField}`, formatResponse(interaction)],
  ];
  const pattern = formatCorrectPattern(interaction);
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
