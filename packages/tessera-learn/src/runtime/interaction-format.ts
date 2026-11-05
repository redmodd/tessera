/**
 * SCORM 1.2 RTE §3.4.7 vs SCORM 2004 4E RTE §4.2.7 differ in delimiter
 * encoding and identifier rules; cmi5 and xAPI reuse 2004's encoding
 * without its caps.
 */

import {
  optionId,
  optionText,
  reversedRange,
  stepRange,
  type Interaction,
  type InteractionOption,
  type OptionPairs,
} from './interaction.js';

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
  /**
   * How a choice, sequencing or matching option records. SCORM 1.2 takes one
   * character per id, so `index` records its position. SCORM 2004 has no
   * field for option text, so `text` records an option that has text as
   * `position.text`, and any other as its id.
   */
  optionEncoding: 'index' | 'text' | 'id';
  /**
   * SCORM 2004 4E RTE §4.2.7 caps `correct_responses` at 10 patterns for
   * `fill-in` and 1 for `long-fill-in`.
   */
  fillInLimit: number;
  longFillInLimit: number;
  /**
   * Longest response or correct answer the LMS takes for a type. SCORM 1.2
   * caps every CMIFeedback value at 255 characters; SCORM 2004 caps
   * long-fill-in and other at 4000. Strict LMSs reject a longer value
   * (405 / 406).
   */
  maxValueLength(type: Interaction['type']): number;
  /**
   * SCORM 2004 caps each performance step answer and each fill-in `[,]`
   * part at 250 characters.
   */
  maxPartLength: number;
  /** SCORM 2004 keeps an unnamed step as `[.]answer`; SCORM 1.2 names it `_`. */
  namelessSteps: boolean;
  /**
   * What the LMS rejects in a value's encoded items, by type. SCORM 1.2 has
   * none; its option ids are checked while encoding.
   */
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
  nonEmpty?: boolean;
  /**
   * Items are steps. Each needs a name or an answer, and an answer can't hold
   * `[,]`, `[.]` or `[:]` unless `range` lets it be a `min[:]max` range.
   */
  steps?: 'text' | 'range';
  /**
   * No item can start with a closed `{lang=}`, `{case_matters=}` or
   * `{order_matters=}`: the LMS strips it from the start of each fill-in
   * part, or rejects the pattern when one can't go there. No escape keeps one
   * as answer text. An unclosed one is plain text.
   */
  undelimited?: boolean;
  /**
   * No item can start with `{lang=`, closed or not: the LMS reads a valid tag
   * as the item's language and rejects any other.
   */
  untagged?: boolean;
}

/**
 * In a correct answer, breaking `maxParts`, `trimmed`, `unique`,
 * `undelimited`, `untagged` or `unopened` drops only that answer; breaking any
 * other rule leaves out the whole field.
 */
interface AnswerRule extends ItemRule {
  trimmed?: boolean;
  unique?: boolean;
  /**
   * The answer can't start with any of these, closed or not: SCORM Cloud
   * reads one as the pattern's opening delimiter and rejects it unclosed.
   */
  unopened?: readonly string[];
}

type ValueRules = Partial<
  Record<Interaction['type'], { response?: ItemRule; correct?: AnswerRule }>
>;

const LIST: ItemRule = { maxItems: 36, nonEmpty: true };
const STEPS: ItemRule = { maxItems: 250, nonEmpty: true, steps: 'text' };

/**
 * The SCORM 2004 grammar scorm-again and SCORM Cloud accept. Encoded ids hold
 * no whitespace, and choice and matching items are already deduplicated.
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
    response: { maxParts: 10, untagged: true },
    correct: {
      maxParts: 10,
      trimmed: true,
      unique: true,
      undelimited: true,
      unopened: ['{case_matters=', '{order_matters='],
    },
  },
  'long-fill-in': {
    response: { untagged: true },
    correct: {
      trimmed: true,
      untagged: true,
      undelimited: true,
      unopened: ['{case_matters='],
    },
  },
  other: { correct: { trimmed: true } },
};

/** xAPI reads a response in the correct pattern's format. */
const XAPI_TEXT = {
  response: { undelimited: true },
  correct: { undelimited: true },
};

const XAPI_RULES: ValueRules = {
  'fill-in': XAPI_TEXT,
  'long-fill-in': XAPI_TEXT,
};

export const SCORM12_INTERACTION_FORMAT: InteractionFormat = {
  itemDelim: ',',
  pairDelim: '.',
  rangeDelim: ':',
  supportsRange: false,
  supportsCasePrefix: false,
  optionEncoding: 'index',
  fillInLimit: 10,
  longFillInLimit: 10,
  maxValueLength: () => 255,
  maxPartLength: Infinity,
  namelessSteps: false,
  formatBoolean: (v) => (v ? 't' : 'f'),
  identifier: shortIdentifier,
  responseId: scormResponseId,
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
  optionEncoding: 'text',
  fillInLimit: 10,
  longFillInLimit: 1,
  maxValueLength: (type) =>
    type === 'long-fill-in' || type === 'other' ? 4000 : Infinity,
  maxPartLength: 250,
  namelessSteps: true,
  rules: SCORM2004_RULES,
  formatBoolean: (v) => (v ? 'true' : 'false'),
  identifier: (v) => v,
  responseId: scormResponseId,
};

export const XAPI_INTERACTION_FORMAT: InteractionFormat = {
  ...SCORM2004_INTERACTION_FORMAT,
  optionEncoding: 'id',
  fillInLimit: Infinity,
  longFillInLimit: Infinity,
  maxValueLength: () => Infinity,
  maxPartLength: Infinity,
  rules: XAPI_RULES,
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

export const SCORM12_MAX_OPTIONS = 36;

const CASE_PREFIX = '{case_matters=true}';

/** A value the format cannot record, so its field is left out of the LMS record. */
class UnrecordableError extends Error {}

/** SCORM 1.2 records a list id as its position in the options passed. */
function recordsIndex<T extends object>(
  options: T | undefined,
  fmt: InteractionFormat,
): options is T {
  return fmt.optionEncoding === 'index' && options !== undefined;
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
function latin(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/./gu, (c) => UNSPLIT_LETTERS[c] ?? c);
}

/**
 * A SCORM id inside a response: letters, digits and `_`. Moodle also allows
 * `.` in SCORM 2004, but it is left to position text (`3.Paris`). An id of
 * those characters records as written. Any other id drops accents
 * (`café` → `cafe`), records letters of other scripts as code points
 * (`東京` → `u6771u4EAC`) so they stay distinct, and slugs the rest to `_`.
 */
function scormResponseId(value: string, max = 250): string {
  if (/^\w+$/.test(value)) return value.slice(0, max);
  const spelled = value.normalize('NFC').replace(/./gsu, (c) => {
    const plain = latin(c);
    if (/^[A-Za-z0-9]+$/.test(plain)) return plain;
    if (!/[\p{L}\p{N}\p{M}]/u.test(c)) return '_';
    return `u${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')}`;
  });
  return shortIdentifier(spelled, max);
}

/**
 * The option's 1-based position and text (`3.Paris_France`), which the
 * format records in place of its id so LMS reports show the answer. Moodle
 * rejects any character but letters, digits, `_` and `.` (406), so the text
 * is spelled in Latin letters without accents and its other characters
 * become `_`. The position keeps options with the same text apart. Undefined
 * for an option without text, and for a repeated id, which cannot say which
 * option the learner chose. Text with no Latin letter or digit records as
 * `2._`, unless the id is Latin letters, digits and `_` with a letter, which
 * says more: a digit-only id beside positions reads as one, and any other id
 * records folded, so it can merge with another.
 */
function positionText(
  value: string,
  options: InteractionOption[] | undefined,
  fmt: InteractionFormat,
): string | undefined {
  if (fmt.optionEncoding !== 'text' || !Array.isArray(options)) return;
  const idx = options.findIndex((option) => optionId(option) === value);
  if (
    idx < 0 ||
    options.some((option, k) => k > idx && optionId(option) === value)
  ) {
    return;
  }
  const text = optionText(options[idx]);
  if (!text) return;
  const plain = latin(text);
  const position = `${idx + 1}.`;
  if (!/[A-Za-z0-9]/.test(plain)) {
    return /^\w*[A-Za-z]\w*$/.test(value) ? undefined : `${position}_`;
  }
  return position + shortIdentifier(plain, 250 - position.length);
}

/**
 * SCORM 1.2 CMIFeedback takes one character per choice or matching id
 * (0-9, a-z), so an index encodes as one base-36 digit.
 */
function encodeListItem(
  value: string,
  options: InteractionOption[] | undefined,
  fmt: InteractionFormat,
): string {
  const text = positionText(value, options, fmt);
  if (text !== undefined) return text;
  if (!recordsIndex(options, fmt)) return fmt.responseId(value);
  const idx = options.findIndex((option) => optionId(option) === value);
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
  optionPairs: OptionPairs | undefined,
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
  if (i.type === 'performance') {
    return (i[field] ?? []).map((s) => encodeStep(s, fmt));
  }
  const items =
    i.type === 'matching'
      ? (i[field] ?? []).map((p) => encodePair(p, i.optionPairs, fmt))
      : (i[field] ?? []).map((v) => encodeListItem(v, i.options, fmt));
  // Choice and matching answers are sets; SCORM 2004 rejects a repeated item.
  return i.type === 'sequencing' ? items : [...new Set(items)];
}

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

/** Null when none was provided or the format can't write its range. */
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
      const answers = i.correct as string[];
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

/**
 * A delimiter, not part of the answer: the format's rules and length cap
 * apply to the answer alone.
 */
function casePrefix(i: Interaction, fmt: InteractionFormat): string {
  return fmt.supportsCasePrefix &&
    (i.type === 'fill-in' || i.type === 'long-fill-in') &&
    i.caseMatters
    ? CASE_PREFIX
    : '';
}

const DELIMITER_START = /^\{(?:lang|case_matters|order_matters)=[^}]*\}/;
const DELIMITERS = '{lang=}, {case_matters=} or {order_matters=}';

/** The LMS reads a delimiter at the start of each fill-in `[,]` part too. */
function startingWith(i: Interaction, start: string): string {
  const parts = i.type === 'fill-in' ? ', or with one after [,]' : '';
  return `starting with ${start}${parts}`;
}

const STEP_DELIM = /\[[,.:]\]/;

function checkSteps(
  steps: Array<[string, string | number]>,
  mode: NonNullable<ItemRule['steps']>,
  fmt: InteractionFormat,
): void {
  for (const [step, a] of steps) {
    const answer = String(a);
    if (stepName(step, fmt) === '' && answer === '') {
      throw new UnrecordableError(
        'a step has neither a name nor an answer, which this export standard rejects',
      );
    }
    if (STEP_DELIM.test(answer) && !(mode === 'range' && stepRange(answer))) {
      throw new UnrecordableError(
        `the step answer "${answer}" holds [,], [.] or [:], which this export standard reads as a delimiter`,
      );
    }
  }
}

const DROPS = [
  'undelimited',
  'untagged',
  'unopened',
  'trimmed',
  'unique',
  'maxParts',
] as const;
type DroppedBy = (typeof DROPS)[number];

/**
 * Checks a value against the format's rules for its type: steps as written,
 * everything else on the encoded items. Throws when the field cannot be
 * recorded; returns the rule a correct answer breaks when only that answer is
 * dropped.
 */
function checkValue(
  i: Interaction,
  field: 'response' | 'correct',
  items: string[],
  fmt: InteractionFormat,
): DroppedBy | undefined {
  const rule: AnswerRule | undefined = fmt.rules?.[i.type]?.[field];
  if (!rule) return;
  if (rule.steps && i.type === 'performance') {
    checkSteps(i[field] ?? [], rule.steps, fmt);
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
  if (rule.undelimited && items.some((item) => DELIMITER_START.test(item))) {
    if (field === 'correct') return 'undelimited';
    throw new UnrecordableError(
      `it is text ${startingWith(i, DELIMITERS)}, which this export standard reads as a delimiter`,
    );
  }
  if (rule.untagged && items.some((item) => item.startsWith('{lang='))) {
    if (field === 'correct') return 'untagged';
    throw new UnrecordableError(
      `it is text ${startingWith(i, '{lang=')}, which this export standard reads as a language tag or rejects`,
    );
  }
  if (rule.unopened?.some((start) => items[0]?.startsWith(start))) {
    return 'unopened';
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
  description?: string | null;
}

/**
 * Ids recorded through `responseId` or as their option's position and text,
 * grouped so ids in one group must stay distinct.
 */
interface IdGroup {
  ids: string[];
  options?: InteractionOption[];
}

/**
 * Every option's id: two options can merge in the LMS record even when no
 * one learner picks both.
 */
function optionIds(options: InteractionOption[] | undefined): string[] {
  if (!Array.isArray(options)) return [];
  return options
    .map(optionId)
    .filter((id): id is string => typeof id === 'string');
}

function responseIdGroups(i: Interaction, fmt: InteractionFormat): IdGroup[] {
  switch (i.type) {
    case 'choice':
    case 'sequencing': {
      if (recordsIndex(i.options, fmt)) return [];
      const ids = [...i.response, ...(i.correct ?? [])];
      return [{ ids: [...optionIds(i.options), ...ids], options: i.options }];
    }
    case 'matching': {
      const { left, right } = i.optionPairs ?? {};
      if (recordsIndex(i.optionPairs, fmt)) return [];
      const pairs = [...i.response, ...(i.correct ?? [])];
      return [
        { ids: [...optionIds(left), ...pairs.map(([l]) => l)], options: left },
        {
          ids: [...optionIds(right), ...pairs.map(([, r]) => r)],
          options: right,
        },
      ];
    }
    case 'performance': {
      const steps = [...i.response, ...(i.correct ?? [])].map(([s]) => s);
      return [
        {
          ids: [...optionIds(i.options), ...steps].filter(
            (step) => stepName(step, fmt) !== '',
          ),
        },
      ];
    }
    case 'likert':
      return [
        {
          ids: [...optionIds(i.options), i.response, i.correct ?? i.response],
        },
      ];
    default:
      return [];
  }
}

/** Two distinct ids in one group that record as the same id, and that id. */
function mergedIds(
  groups: string[][],
  fmt: InteractionFormat,
): { ids: [string, string]; recorded: string } | undefined {
  for (const ids of groups) {
    const seen = new Map<string, string>();
    for (const id of ids) {
      const recorded = fmt.responseId(id);
      const first = seen.get(recorded) ?? id;
      if (first !== id) return { ids: [first, id], recorded };
      seen.set(recorded, id);
    }
  }
}

/**
 * Formats the correct patterns, drops those over the format's length cap,
 * since a shortened pattern matches nothing, then keeps the first ones up to
 * its count cap. Each warning completes a sentence whose subject is the
 * question. `kept` is null when there is no pattern to send: none was given,
 * the format can't write it, or every answer was dropped. Throws when the
 * format cannot record a value.
 */
export function fitPatterns(
  i: Interaction,
  fmt: InteractionFormat,
  recorder = 'this export standard',
): { kept: string[] | null; warnings: string[] } {
  const lost = 'graded but left out of the LMS record';
  if (
    i.type === 'performance' &&
    i.correct &&
    hasLongStep(i.correct, fmt.maxPartLength)
  ) {
    return {
      kept: null,
      warnings: [
        `has a correct step answer over the ${fmt.maxPartLength} characters ${recorder} records; the correct answer is ${lost}`,
      ],
    };
  }
  if (fmt.supportsRange && reversedRange(i)) {
    return {
      kept: null,
      warnings: [
        `has a correct range with its minimum above its maximum, which no answer can match; the correct answer is ${lost}`,
      ],
    };
  }
  const answers = correctItems(i, fmt);
  if (!answers) return { kept: null, warnings: [] };
  const broken = answers.map((it) => checkValue(i, 'correct', it, fmt));
  const rejects = `which ${recorder} rejects`;
  const reason = (rule: DroppedBy): string => {
    switch (rule) {
      case 'undelimited':
        return `${startingWith(i, DELIMITERS)}, which ${recorder} reads as a delimiter or rejects`;
      case 'untagged':
        return `${startingWith(i, '{lang=')}, ${rejects}`;
      case 'unopened':
        return `starting with ${fmt.rules?.[i.type]?.correct?.unopened?.join(' or ')}, ${rejects}`;
      case 'trimmed':
        return `${
          isList(i)
            ? 'with an item starting or ending in whitespace'
            : i.type === 'fill-in'
              ? 'starting or ending in whitespace, or with whitespace beside [,]'
              : 'starting or ending in whitespace'
        }, ${rejects}`;
      case 'unique':
        return `repeating ${i.type === 'fill-in' ? 'a [,]-separated part' : 'an item'}, ${rejects}`;
      case 'maxParts':
        return `with more than ${fmt.rules?.[i.type]?.correct?.maxParts} [,]-separated parts, ${rejects}`;
    }
  };
  const warnings: string[] = [];
  for (const rule of DROPS) {
    const dropped = broken.filter((b) => b === rule).length;
    if (dropped) {
      warnings.push(
        `has ${dropped} correct answer(s) ${reason(rule)}; they are ${lost}`,
      );
    }
  }
  const recordable = answers.filter((_, k) => !broken[k]);
  const max = fmt.maxValueLength(i.type);
  const partMax = i.type === 'fill-in' ? fmt.maxPartLength : Infinity;
  const limit =
    i.type === 'long-fill-in' ? fmt.longFillInLimit : fmt.fillInLimit;
  const fit = recordable
    .filter((it) => it.every((part) => part.length <= partMax))
    .map((it) => it.join(fmt.itemDelim))
    .filter((p) => p.length <= max);
  if (fit.length < recordable.length) {
    const cap =
      partMax < Infinity
        ? `${partMax} characters ${recorder} records per [,]-separated part`
        : `${max} characters ${recorder} records`;
    warnings.push(
      `has ${recordable.length - fit.length} correct answer(s) over the ${cap}; they are ${lost}`,
    );
  }
  if (fit.length > limit) {
    const counted =
      fit.length < recordable.length ? ' short enough to record,' : '';
    warnings.push(
      `has ${fit.length} correct answers${counted} but ${recorder} records at most ${limit}; the rest are ${lost}`,
    );
  }
  const prefix = casePrefix(i, fmt);
  const kept = fit.slice(0, limit).map((p) => prefix + p);
  // An empty list stays: xAPI reads [] as "no answer is correct".
  return { kept: answers.length && !kept.length ? null : kept, warnings };
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

/**
 * Cuts on a character boundary, so an emoji or accented letter stays whole,
 * unless one character runs past max (a letter with hundreds of accents).
 */
export function cutText(value: string, max: number): string {
  for (const { index, segment } of new Intl.Segmenter().segment(value)) {
    if (index + segment.length <= max) continue;
    if (segment.length <= max) return value.slice(0, index);
    const cut = value.slice(0, max);
    return /[\uD800-\uDBFF]$/.test(cut) ? cut.slice(0, -1) : cut;
  }
  return value;
}

/**
 * Cuts a response to the format's length caps. Each SCORM 2004 fill-in part
 * and performance step answer is cut on its own first. A list keeps only
 * whole items, since a half-written id or pair is wrong data, but a
 * performance response whose first step doesn't fit keeps that step with its
 * answer cut. Null when nothing fits.
 */
function fitResponse(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): string | null {
  const partMax = fmt.maxPartLength;
  let longPart = '';
  if (i.type === 'performance' && hasLongStep(i.response, partMax)) {
    longPart = 'a step answer';
    i = {
      ...i,
      response: i.response.map(([step, a]): [string, string | number] => [
        step,
        typeof a === 'string' ? cutText(a, partMax) : a,
      ]),
    };
  }
  let items = responseItems(i, fmt);
  if (i.type === 'fill-in' && items.some((part) => part.length > partMax)) {
    longPart = 'a response part';
    items = items.map((part) => cutText(part, partMax));
  }
  checkValue(i, 'response', items, fmt);
  if (longPart) {
    console.warn(
      `Tessera: interaction "${questionId}" has ${longPart} over the ${partMax} characters this export standard records; the LMS gets at most its first ${partMax} characters.`,
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

function recordable<T>(
  questionId: string,
  field: string,
  format: () => T,
): T | null {
  try {
    return format();
  } catch (err) {
    if (!(err instanceof UnrecordableError)) throw err;
    console.warn(
      `Tessera: the ${field} of interaction "${questionId}" is left out of the LMS record: ${err.message}.`,
    );
    return null;
  }
}

/** The response as the LMS records it, or null when it can't, with a warning. */
export function formatResponse(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): string | null {
  return recordable(questionId, 'response', () =>
    fitResponse(questionId, i, fmt),
  );
}

/** The correct patterns the LMS records, or null when none, with warnings. */
export function formatPatterns(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): string[] | null {
  return recordable(questionId, 'correct answer', () => {
    const { kept, warnings } = fitPatterns(i, fmt);
    for (const warning of warnings) {
      console.warn(`Tessera: interaction "${questionId}" ${warning}.`);
    }
    return kept;
  });
}

function warnResponseIds(
  questionId: string,
  i: Interaction,
  fmt: InteractionFormat,
): void {
  // An id recorded as its option's position and text never merges: positions
  // differ, and only position text holds a `.`.
  const groups = responseIdGroups(i, fmt).map(({ ids, options }) =>
    ids.filter((id) => positionText(id, options, fmt) === undefined),
  );
  const ids = groups.flat();
  if (
    fmt.optionEncoding === 'index' &&
    i.type !== 'performance' &&
    i.type !== 'likert'
  ) {
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
  if (i.type === 'likert') {
    // Values from different learners can merge too, so this warns on any change
    // and stands in for the merge warning.
    const changed = ids.find((v) => fmt.responseId(v, Infinity) !== v);
    if (changed !== undefined) {
      console.warn(
        `Tessera: interaction "${questionId}" records the likert value "${changed}" as "${fmt.responseId(changed)}", so values that differ only in punctuation or accents record the same. Send values of letters, digits and underscores.`,
      );
    }
    return;
  }
  const merged = mergedIds(groups, fmt);
  if (merged) {
    const {
      ids: [a, b],
      recorded,
    } = merged;
    console.warn(
      `Tessera: interaction "${questionId}" records the ids "${a}" and "${b}" both as "${recorded}", so the LMS record cannot tell them apart. Give them ids that differ in more than punctuation or accents.`,
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
  if (spec.description) fields.push(['description', spec.description]);
  warnResponseIds(questionId, interaction, spec.format);
  const patterns = formatPatterns(questionId, interaction, spec.format);
  const response = formatResponse(questionId, interaction, spec.format);
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
