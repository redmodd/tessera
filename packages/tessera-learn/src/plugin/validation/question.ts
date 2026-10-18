import JSON5 from 'json5';
import { staticQuestionId } from '../manifest.js';
import { isLiteralTrue, type ComponentMatch, type PropValue } from '../ast.js';
import type { StandardProfile } from '../../runtime/standards.js';
import {
  SCORM12_MAX_OPTIONS,
  formatCorrectPattern,
  type InteractionFormat,
} from '../../runtime/interaction-format.js';
import { isRecord, isStringArray } from '../../runtime/types.js';
import type { QuestionComponentName } from '../../components/util.js';
import { A11Y_IDS, tag } from './a11y.js';
import { formatValue, type Diagnostics } from './diagnostics.js';

function staticValue(prop: PropValue | undefined): unknown {
  if (prop?.kind !== 'expr') return undefined;
  try {
    return JSON5.parse(prop.raw);
  } catch {
    return undefined;
  }
}

function staticArray(prop: PropValue | undefined): unknown[] | null {
  if (prop?.kind !== 'expr' || !prop.raw.startsWith('[')) return null;
  const value = staticValue(prop);
  return Array.isArray(value) ? value : null;
}

function staticNumber(prop: PropValue | undefined): number | null {
  const value = staticValue(prop);
  return typeof value === 'number' ? value : null;
}

/** An export standard that records interactions in the LMS. */
interface RecordingStandard {
  name: string;
  format: InteractionFormat;
}

interface QuestionComponentRule {
  required: string[];
  /**
   * Props whose entries SCORM 1.2 records as one-character indexes; `every`
   * when each complete answer and the correct pattern use every entry.
   */
  indexedLists?: Record<string, 'some' | 'every'>;
  check(
    props: ComponentMatch['props'],
    fileRel: string,
    d: Diagnostics,
    standard: RecordingStandard | undefined,
  ): void;
}

const QUESTION_COMPONENTS: Record<
  QuestionComponentName,
  QuestionComponentRule
> = {
  MultipleChoice: {
    required: ['question', 'options', 'correct'],
    indexedLists: { options: 'some' },
    check(props, fileRel, d) {
      const options = staticArray(props.get('options'));
      const correct = staticNumber(props.get('correct'));
      if (options && correct !== null) {
        if (
          !Number.isInteger(correct) ||
          correct < 0 ||
          correct >= options.length
        ) {
          d.error(
            `${fileRel}: <MultipleChoice> correct={${correct}} is out of range for ${options.length} options (valid: 0–${options.length - 1})`,
          );
        }
      }
      const optionFeedback = staticArray(props.get('optionFeedback'));
      if (options && optionFeedback && optionFeedback.length > options.length) {
        d.warn(
          `${fileRel}: <MultipleChoice> optionFeedback has ${optionFeedback.length} entries but only ${options.length} options — the extra entries can never be shown`,
        );
      }
    },
  },
  FillInTheBlank: {
    required: ['question', 'answers'],
    check(props, fileRel, d, standard) {
      const answersProp = props.get('answers');
      const answers = staticArray(answersProp);
      if (answers) {
        if (answers.length === 0) {
          d.error(`${fileRel}: <FillInTheBlank> answers must not be empty`);
        } else if (!isStringArray(answers)) {
          d.error(
            `${fileRel}: <FillInTheBlank> answers must be an array of strings`,
          );
        }
      }
      if (!standard) return;
      const { format } = standard;
      const max = format.maxValueLength('fill-in');
      const value =
        answersProp?.kind === 'string'
          ? answersProp.value
          : staticValue(answersProp);
      const correct = [value]
        .flat()
        .filter((a) => typeof a === 'string')
        .map((a) => a.trim());
      const caseMatters =
        format.supportsCasePrefix && isLiteralTrue(props.get('caseSensitive'));
      const patterns =
        formatCorrectPattern(
          { type: 'fill-in', response: '', correct, caseMatters },
          format,
        ) ?? [];
      const long = patterns.filter((p) => p.length > max).length;
      if (long > 0) {
        const prefix = caseMatters
          ? ', counting the {case_matters=true} prefix of a case-sensitive answer'
          : '';
        d.warn(
          `${fileRel}: <FillInTheBlank> has ${long} answer(s) over the ${max} characters ${standard.name} records${prefix}; they are graded but left out of the LMS record`,
        );
      }
    },
  },
  Matching: {
    required: ['question', 'pairs'],
    indexedLists: { pairs: 'every' },
    check(props, fileRel, d) {
      const pairs = staticArray(props.get('pairs'));
      if (pairs) {
        const bad = pairs.some(
          (p) =>
            !isRecord(p) ||
            typeof p.left !== 'string' ||
            typeof p.right !== 'string',
        );
        if (bad) {
          d.error(
            `${fileRel}: <Matching> pairs must be an array of { left: string, right: string } objects`,
          );
        }
      }
    },
  },
  Sorting: {
    required: ['question', 'items', 'targets', 'correct'],
    indexedLists: { items: 'every', targets: 'some' },
    check(props, fileRel, d) {
      const items = staticArray(props.get('items'));
      const targets = staticArray(props.get('targets'));
      const correct = staticArray(props.get('correct'));
      if (items && correct && correct.length !== items.length) {
        d.error(
          `${fileRel}: <Sorting> correct has ${correct.length} entries but items has ${items.length} — they must be parallel arrays`,
        );
      }
      if (targets && correct) {
        for (const idx of correct) {
          if (
            typeof idx !== 'number' ||
            !Number.isInteger(idx) ||
            idx < 0 ||
            idx >= targets.length
          ) {
            d.error(
              `${fileRel}: <Sorting> correct contains ${formatValue(idx)}, out of range for ${targets.length} targets (valid: 0–${targets.length - 1})`,
            );
            break;
          }
        }
      }
    },
  },
};

export function validateQuestionComponents(
  components: ComponentMatch[],
  fileRel: string,
  d: Diagnostics,
  profile: StandardProfile | undefined,
): void {
  const standard =
    profile && 'interactionFormat' in profile
      ? { name: profile.name, format: profile.interactionFormat }
      : undefined;
  const seenIds = new Set<string>();
  const seenSanitized = new Set<string>();
  for (const match of components) {
    const { name, props, hasSpread } = match;
    const rule = QUESTION_COMPONENTS[name as QuestionComponentName];
    for (const req of rule.required) {
      if (!hasSpread && !props.has(req)) {
        d.error(`${fileRel}: <${name}> is missing required prop "${req}"`);
      }
    }

    // Rule 1.5: empty option/answer labels are both an a11y and a scoring bug.
    for (const labelProp of ['options', 'answers']) {
      const entries = staticArray(props.get(labelProp));
      if (entries?.some((e) => typeof e === 'string' && e.trim() === '')) {
        d.warn(
          tag(
            A11Y_IDS.questionLabel,
            `${fileRel}: <${name}> has an empty ${labelProp === 'options' ? 'option' : 'answer'} label`,
          ),
        );
      }
    }

    const resolvedId = staticQuestionId(match);
    // With no `id`, the widget derives one from the prompt text, so two
    // identically worded questions collide on one page.
    const derived = resolvedId !== null && !props.has('id');

    if (resolvedId !== null) {
      if (seenIds.has(resolvedId)) {
        d.error(
          derived
            ? `${fileRel}: <${name}> has no id and its question text falls back to "${resolvedId}", which another question on this page already uses — give each an explicit id`
            : `${fileRel}: duplicate question id "${resolvedId}" — each question on a page needs a unique id`,
        );
      } else if (standard) {
        // The standard's identifier rules can rewrite ids, so distinct raw ids
        // can collide after sanitization. Skip raw duplicates (already flagged
        // above) to avoid double-reporting the same id.
        const sane = standard.format.identifier(resolvedId);
        if (!derived && sane !== resolvedId) {
          d.warn(
            `${fileRel}: question id "${resolvedId}" will be rewritten to "${sane}" for ${standard.name} — use only letters and digits (underscores only between them)`,
          );
        }
        if (seenSanitized.has(sane)) {
          d.error(
            `${fileRel}: question id "${resolvedId}" collides with a prior id after ${standard.name} sanitization ("${sane}")`,
          );
        }
        seenSanitized.add(sane);
      }
      seenIds.add(resolvedId);
    }

    const weightProp = props.get('weight');
    if (weightProp?.kind === 'string') {
      d.warn(
        `${fileRel}: <${name}> weight="${weightProp.value}" is a string and is ignored (treated as 1) — pass a number: weight={${weightProp.value}}`,
      );
    } else {
      const weight = staticNumber(weightProp);
      if (weight !== null && !(Number.isFinite(weight) && weight > 0)) {
        d.warn(
          `${fileRel}: <${name}> weight ${weight} is not a positive finite number and is ignored (treated as 1)`,
        );
      }
    }

    if (standard?.format.encodesOptionIndex) {
      for (const [prop, use] of Object.entries(rule.indexedLists ?? {})) {
        const count = staticArray(props.get(prop))?.length ?? 0;
        if (count > SCORM12_MAX_OPTIONS) {
          const lost =
            use === 'every'
              ? 'every response and correct answer'
              : `any response or correct answer that uses one past the ${SCORM12_MAX_OPTIONS}th`;
          d.warn(
            `${fileRel}: <${name}> has ${count} ${prop} but ${standard.name} records at most ${SCORM12_MAX_OPTIONS}; ${lost} is left out of the LMS record`,
          );
        }
      }
    }

    rule.check(props, fileRel, d, standard);
  }
}
