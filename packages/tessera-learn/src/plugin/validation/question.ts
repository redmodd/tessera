import {
  literalValue,
  staticQuestionId,
  type QuestionComponentName,
} from '../manifest.js';
import type { ComponentMatch, PropValue } from '../ast.js';
import type { StandardProfile } from '../../runtime/standards.js';
import {
  SCORM12_MAX_OPTIONS,
  fitPatterns,
} from '../../runtime/interaction-format.js';
import { isRecord, isStringArray } from '../../runtime/types.js';
import { fillInAnswers } from '../../components/util.js';
import { A11Y_IDS, tag } from './a11y.js';
import { formatValue, type Diagnostics } from './diagnostics.js';

/** False only when the prop is statically falsy, or absent with no spread to set it. */
export function propMayBeTruthy(
  { props, hasSpread }: ComponentMatch,
  name: string,
): boolean {
  const prop = props.get(name);
  if (prop === undefined) return hasSpread;
  const literal = literalValue(prop);
  return !literal || Boolean(literal.value);
}

function staticArray(prop: PropValue | undefined): unknown[] | null {
  const value = literalValue(prop)?.value;
  return Array.isArray(value) ? value : null;
}

function staticList(prop: PropValue | undefined): unknown[] | null {
  const literal = literalValue(prop);
  if (!literal) return null;
  return Array.isArray(literal.value) ? literal.value : [literal.value];
}

function staticNumber(prop: PropValue | undefined): number | null {
  const value = literalValue(prop)?.value;
  return typeof value === 'number' ? value : null;
}

type RecordingStandard = Extract<
  StandardProfile,
  { interactionFormat: unknown }
>;

interface RuleContext {
  d: Diagnostics;
  standard: RecordingStandard | undefined;
  id: string | null;
}

interface QuestionComponentRule {
  required: string[];
  /**
   * Props whose entries SCORM 1.2 records as one-character indexes; `every`
   * when each complete answer and the correct pattern use every entry, as one
   * matching pair each, so SCORM 2004's item cap applies too.
   */
  indexedLists?: Record<string, 'some' | 'every'>;
  check(match: ComponentMatch, ctx: RuleContext): void;
}

const QUESTION_COMPONENTS: Record<
  QuestionComponentName,
  QuestionComponentRule
> = {
  MultipleChoice: {
    required: ['id', 'question', 'options', 'correct'],
    indexedLists: { options: 'some' },
    check({ props }, { d }) {
      const options = staticArray(props.get('options'));
      const correct = staticNumber(props.get('correct'));
      if (options && correct !== null) {
        if (
          !Number.isInteger(correct) ||
          correct < 0 ||
          correct >= options.length
        ) {
          d.error(
            `<MultipleChoice> correct={${correct}} is out of range for ${options.length} options (valid: 0–${options.length - 1})`,
          );
        }
      }
      const optionFeedback = staticArray(props.get('optionFeedback'));
      if (options && optionFeedback && optionFeedback.length > options.length) {
        d.warn(
          `<MultipleChoice> optionFeedback has ${optionFeedback.length} entries but only ${options.length} options, so the extra entries can never be shown`,
        );
      }
    },
  },
  FillInTheBlank: {
    required: ['id', 'question', 'answers'],
    check(match, { d, standard, id }) {
      const answers = staticList(match.props.get('answers'));
      if (answers) {
        if (!isStringArray(answers)) {
          d.error(
            `<FillInTheBlank> answers must be a string or an array of strings`,
          );
        } else if (answers.every((a) => a.trim() === '')) {
          // A learner can't submit blank input, so no response could match.
          d.error(`<FillInTheBlank> answers must not be empty`);
        } else if (answers.some((a) => a.trim() === '')) {
          d.warn(
            tag(
              A11Y_IDS.questionLabel,
              `<FillInTheBlank> has an empty answer label`,
            ),
          );
        }
      }
      if (!standard || !isStringArray(answers)) return;
      const { warnings } = fitPatterns(
        {
          type: 'fill-in',
          response: '',
          correct: fillInAnswers(answers),
        },
        standard.interactionFormat,
        standard.name,
      );
      const subject = id === null ? '' : ` "${id}"`;
      for (const warning of warnings) {
        d.warn(`<FillInTheBlank>${subject} ${warning}`);
      }
    },
  },
  Matching: {
    required: ['id', 'question', 'pairs'],
    indexedLists: { pairs: 'every' },
    check({ props }, { d }) {
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
            `<Matching> pairs must be an array of { left: string, right: string } objects`,
          );
        }
      }
    },
  },
  Sorting: {
    required: ['id', 'question', 'items', 'targets', 'correct'],
    indexedLists: { items: 'every', targets: 'some' },
    check({ props }, { d }) {
      const items = staticArray(props.get('items'));
      const targets = staticArray(props.get('targets'));
      const correct = staticArray(props.get('correct'));
      if (items && correct && correct.length !== items.length) {
        d.error(
          `<Sorting> correct has ${correct.length} entries but items has ${items.length}; they must be parallel arrays`,
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
              `<Sorting> correct contains ${formatValue(idx)}, out of range for ${targets.length} targets (valid: 0–${targets.length - 1})`,
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
  d: Diagnostics,
  profile: StandardProfile | undefined,
): void {
  const standard =
    profile && 'interactionFormat' in profile ? profile : undefined;
  const seenIds = new Set<string>();
  const seenSanitized = new Set<string>();
  for (const match of components) {
    const { name, props, hasSpread } = match;
    const rule = QUESTION_COMPONENTS[name as QuestionComponentName];
    for (const req of rule.required) {
      if (!hasSpread && !props.has(req)) {
        d.error(`<${name}> is missing required prop "${req}"`);
      }
    }

    // Rule 1.5: empty option labels are both an a11y and a scoring bug.
    const options = staticArray(props.get('options'));
    if (options?.some((e) => typeof e === 'string' && e.trim() === '')) {
      d.warn(
        tag(A11Y_IDS.questionLabel, `<${name}> has an empty option label`),
      );
    }

    const resolvedId = staticQuestionId(match);
    if (resolvedId === null && literalValue(props.get('id'))) {
      d.error(`<${name}> id must be a string that is not blank`);
    }
    if (resolvedId !== null) {
      if (seenIds.has(resolvedId)) {
        d.error(
          `duplicate question id "${resolvedId}"; each question on a page needs a unique id`,
        );
      } else if (standard) {
        // The standard's identifier rules can rewrite ids, so distinct raw ids
        // can collide after sanitization. Skip raw duplicates (already flagged
        // above) to avoid double-reporting the same id.
        const sane = standard.interactionFormat.identifier(resolvedId);
        if (sane !== resolvedId) {
          d.warn(
            `question id "${resolvedId}" will be rewritten to "${sane}" for ${standard.name}; use only ASCII letters, digits and underscores`,
          );
        }
        if (seenSanitized.has(sane)) {
          d.error(
            `question id "${resolvedId}" collides with a prior id after ${standard.name} sanitization ("${sane}")`,
          );
        }
        seenSanitized.add(sane);
      }
      seenIds.add(resolvedId);
    }

    const weightProp = props.get('weight');
    if (weightProp?.kind === 'string') {
      d.warn(
        `<${name}> weight="${weightProp.value}" is a string and is ignored (treated as 1). Pass a number: weight={${weightProp.value}}`,
      );
    } else {
      const weight = staticNumber(weightProp);
      if (weight !== null && !(Number.isFinite(weight) && weight > 0)) {
        d.warn(
          `<${name}> weight ${weight} is not a positive finite number and is ignored (treated as 1)`,
        );
      }
    }

    if (standard) {
      const format = standard.interactionFormat;
      for (const [prop, use] of Object.entries(rule.indexedLists ?? {})) {
        const max =
          format.optionEncoding === 'index'
            ? SCORM12_MAX_OPTIONS
            : use === 'every'
              ? (format.rules?.matching?.response?.maxItems ?? Infinity)
              : Infinity;
        const count = staticArray(props.get(prop))?.length ?? 0;
        if (count > max) {
          const lost =
            use === 'every'
              ? 'every response and correct answer'
              : `any response or correct answer that uses one past the ${max}th`;
          d.warn(
            `<${name}> has ${count} ${prop} but ${standard.name} records at most ${max}; ${lost} is left out of the LMS record`,
          );
        }
      }
    }

    rule.check(match, { d, standard, id: resolvedId });
  }
}
