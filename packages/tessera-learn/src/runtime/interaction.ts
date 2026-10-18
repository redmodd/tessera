/**
 * Learner interaction data — the payload `useQuestion` returns to the runtime
 * and that adapters translate into SCORM `cmi.interactions.n.*` or xAPI
 * `cmi.interaction` activity statements.
 *
 * Variants follow the SCORM 2004 4th Edition vocabulary (RTE §4.2.7) verbatim
 * so there is no impedance mismatch when writing to an LMS.
 */
export type Interaction =
  | {
      type: 'choice';
      response: string[];
      correct?: string[];
      options?: string[];
    }
  | { type: 'true-false'; response: boolean; correct?: boolean }
  | {
      type: 'fill-in';
      response: string;
      correct?: string[];
      caseMatters?: boolean;
    }
  | {
      type: 'long-fill-in';
      response: string;
      correct?: string[];
      caseMatters?: boolean;
    }
  | {
      type: 'matching';
      response: Array<[string, string]>;
      correct?: Array<[string, string]>;
      optionPairs?: { left: string[]; right: string[] };
    }
  | {
      type: 'sequencing';
      response: string[];
      correct?: string[];
      options?: string[];
    }
  | {
      type: 'numeric';
      response: number;
      correct?: { min?: number; max?: number };
    }
  | { type: 'likert'; response: string; correct?: string }
  | {
      type: 'performance';
      response: Array<[string, string | number]>;
      correct?: Array<[string, string | number]>;
    }
  | { type: 'other'; response: string; correct?: string };

export type InteractionResponse = Interaction['response'];

/**
 * Put a saved response back into its widget and return the answer the handle
 * then holds: what `restore` returned, else the response. Undefined when there
 * is no response, the widget takes none, or its `restore` throws; the question
 * then shows no answer.
 */
export function restoreResponse(
  question: {
    id: string;
    restore?: (response: InteractionResponse) => unknown;
  },
  response: unknown,
): unknown {
  if (response === undefined || !question.restore) return undefined;
  try {
    return question.restore(response as InteractionResponse) ?? response;
  } catch (err) {
    console.error(
      `[tessera] useQuestion("${question.id}"): restore() threw, so the saved answer is not shown.` +
        (err instanceof ReferenceError
          ? ' It runs inside useQuestion(), so declare the state it writes above that call.'
          : ''),
      err,
    );
    return undefined;
  }
}

/**
 * Decide whether a learner response is correct. Returns:
 *  - `true`  — response matches the correct pattern
 *  - `false` — response does not match
 *  - `null`  — `correct` was not provided; the author will decide externally
 */
export function isCorrect(i: Interaction): boolean | null {
  switch (i.type) {
    case 'choice':
      if (i.correct === undefined) return null;
      return setEqual(i.response, i.correct);
    case 'true-false':
      if (i.correct === undefined) return null;
      return i.response === i.correct;
    case 'fill-in':
    case 'long-fill-in': {
      if (i.correct === undefined) return null;
      const matters = !!i.caseMatters;
      const actual = matters ? i.response : i.response.toLowerCase();
      return i.correct.some((c) => (matters ? c : c.toLowerCase()) === actual);
    }
    case 'matching': {
      if (i.correct === undefined) return null;
      return pairSetEqual(i.response, i.correct);
    }
    case 'sequencing': {
      if (i.correct === undefined) return null;
      if (i.response.length !== i.correct.length) return false;
      for (let k = 0; k < i.response.length; k++) {
        if (i.response[k] !== i.correct[k]) return false;
      }
      return true;
    }
    case 'numeric': {
      if (i.correct === undefined) return null;
      const { min, max } = i.correct;
      if (min !== undefined && i.response < min) return false;
      if (max !== undefined && i.response > max) return false;
      return true;
    }
    case 'likert':
      if (i.correct === undefined) return null;
      return i.response === i.correct;
    case 'performance': {
      if (i.correct === undefined) return null;
      const cmap = new Map<string, string | number>(i.correct);
      const rmap = new Map<string, string | number>(i.response);
      if (rmap.size !== i.response.length || rmap.size !== cmap.size) {
        return false;
      }
      for (const [stepId, value] of rmap) {
        if (!cmap.has(stepId)) return false;
        if (cmap.get(stepId) !== value) return false;
      }
      return true;
    }
    case 'other':
      if (i.correct === undefined) return null;
      return i.response === i.correct;
  }
}

/** A repeated item counts once, as the LMS records it. */
function setEqual(a: string[], b: string[]): boolean {
  const as = new Set(a);
  const bs = new Set(b);
  return as.size === bs.size && [...as].every((x) => bs.has(x));
}

function pairSetEqual(
  a: Array<[string, string]>,
  b: Array<[string, string]>,
): boolean {
  const key = ([l, r]: [string, string]) => `${l}\u241F${r}`;
  return setEqual(a.map(key), b.map(key));
}
