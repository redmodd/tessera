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
      const correct = i.correct;
      if (correct === undefined) return null;
      // Steps grade in order, as `order_matters` defaults to true.
      return (
        i.response.length === correct.length &&
        i.response.every(
          ([step, value], k) =>
            step === correct[k][0] && stepFits(value, correct[k][1]),
        )
      );
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
  const key = (pair: [string, string]) => JSON.stringify(pair);
  return setEqual(a.map(key), b.map(key));
}

const NUMBER = String.raw`-?\d+(?:\.\d+)?`;
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const STEP_RANGE = new RegExp(String.raw`^(${NUMBER})?\[:\](${NUMBER})?$`);

/** A performance step answer written `min[:]max`, either end optional. */
export function stepRange(
  answer: string | number,
): { min?: number; max?: number } | null {
  const m = typeof answer === 'string' ? STEP_RANGE.exec(answer) : null;
  if (!m) return null;
  return {
    min: m[1] === undefined ? undefined : Number(m[1]),
    max: m[2] === undefined ? undefined : Number(m[2]),
  };
}

/** A correct range whose min is above its max, so no answer can match it. */
export function reversedRange(
  i: Interaction,
): { min: number; max: number } | null {
  const ranges =
    i.type === 'numeric'
      ? [i.correct]
      : i.type === 'performance'
        ? (i.correct ?? []).map(([, answer]) => stepRange(answer))
        : [];
  for (const r of ranges) {
    if (r?.min !== undefined && r.max !== undefined && r.min > r.max) {
      return { min: r.min, max: r.max };
    }
  }
  return null;
}

/**
 * Grades a step value as recorded, by its text: a range takes any decimal
 * inside it, ends included, as an LMS grades it (`.5` and `+3` are decimals,
 * `1e-7` is not).
 */
function stepFits(value: string | number, answer: string | number): boolean {
  const text = String(value);
  const range = stepRange(answer);
  if (!range) return text === String(answer);
  const n = Number(text);
  return (
    DECIMAL.test(text) &&
    (range.min === undefined || n >= range.min) &&
    (range.max === undefined || n <= range.max)
  );
}
