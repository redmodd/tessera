import { existsSync, readFileSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import {
  parsePageConfigFromSource,
  readMetaFile,
  ensureSvelteSuffix,
  orderPageFiles,
  walkPages,
  isLiterallyGradedQuestion,
  listedGradedQuestions,
  QUESTION_COMPONENT_NAMES,
  READ_FAILURE_MESSAGES,
  STATIC_LITERAL_RULE,
  type MetaFile,
  type PageConfig,
  type WalkedLesson,
} from '../manifest.js';
import {
  findComponents,
  type ComponentMatch,
  getParseError,
  headingLevels,
  scriptImports,
  useQuestionGrading,
  usesLegacyModuleContext,
} from '../ast.js';
import type { StandardProfile } from '../../runtime/standards.js';
import {
  FEEDBACK_MODES,
  RETRY_MODES,
  isRecord,
  isRequiredGradedPage,
  type QuizConfig,
} from '../../runtime/types.js';
import { A11Y_IDS, tag } from './a11y.js';
import {
  checkOneOf,
  describeType,
  formatValue,
  type Diagnostics,
} from './diagnostics.js';
import { validateAssetRefs, validateMediaComponents } from './media.js';
import { propMayBeTruthy, validateQuestionComponents } from './question.js';

export interface PageInfo {
  fileRel: string;
  graded: boolean;
  requiredGraded: boolean;
  hasQuiz: boolean;
  weight?: number;
  completesOnView: boolean;
}

export interface PagesValidationResult {
  hasParseErrors: boolean;
  pages: PageInfo[];
}

interface PageContext {
  projectRoot: string;
  d: Diagnostics;
  profile: StandardProfile | undefined;
  assetsDir: string;
  // One existsSync per unique asset for the whole pass.
  assetExistsCache: Map<string, boolean>;
}

/**
 * Validate a single page .svelte file. Used for both section-level (flat) and
 * lesson-level pages: the validation is identical, only the containing
 * directory differs.
 */
function validatePageFile(
  filePath: string,
  { projectRoot, d, profile, assetsDir, assetExistsCache }: PageContext,
): { page: PageInfo; parseError: boolean } {
  const fileRel = relative(projectRoot, filePath);
  const content = readFileSync(filePath, 'utf-8');

  const parseError = getParseError(content);
  if (parseError) {
    d.error(`could not parse, ${parseError}`);
    return {
      page: {
        fileRel,
        graded: false,
        requiredGraded: false,
        hasQuiz: false,
        completesOnView: false,
      },
      parseError: true,
    };
  }

  const pageConfig = validatePageConfig(content, d);

  const quiz = pageConfig?.quiz;
  const isQuiz = isRecord(quiz);
  const isGradedQuiz = isQuiz && quiz.graded === true;
  validateQuizConfig(quiz, d);

  checkOneOf(`pageConfig.completesOn`, ['view'], pageConfig?.completesOn, d);
  const completesOnView = pageConfig?.completesOn === 'view';
  const declaresGraded =
    validateBoolean(pageConfig?.graded, 'pageConfig.graded', d) ?? false;
  const declaresRequired = validateBoolean(
    pageConfig?.required,
    'pageConfig.required',
    d,
  );
  const weight = validatePageWeight(pageConfig?.weight, d);
  const graded = isGradedQuiz || declaresGraded;
  const requiredGraded = isRequiredGradedPage({
    graded,
    required: declaresRequired,
  });
  const hasCustomWidget = hasLocalModuleImport(content);
  const questionComponents =
    findComponents(content, QUESTION_COMPONENT_NAMES) ?? [];
  const useQuestions = useQuestionGrading(content);
  if (declaresGraded && isQuiz && !isGradedQuiz) {
    d.error(
      `pageConfig.graded is set on a quiz page whose quiz is not graded. ` +
        "The quiz ignores a question's own `graded`, so nothing on the page can earn a score " +
        'and it never completes. ' +
        'Use quiz: { graded: true }, or drop graded: true.',
    );
  }
  for (const [field, value] of [
    ['required', declaresRequired],
    ['weight', weight],
  ] as const) {
    if (value !== undefined && !graded) {
      d.warn(
        `pageConfig.${field} only applies to a graded page. ` +
          'Without `graded: true` (or `quiz: { graded: true }`) the page never joins the rollup, ' +
          'so it is ignored.',
      );
    }
  }
  if (
    declaresGraded &&
    !isQuiz &&
    splitsAcrossBranches(listedGradedQuestions(questionComponents))
  ) {
    d.warn(
      `graded questions sit in different branches of one {#if}, {#each} or {#await}. ` +
        'The page counts as answered only once every graded question on it is, ' +
        'so a learner shown only one branch can never finish it. ' +
        'Put each branch on its own page, or drop graded from the branch questions.',
    );
  }
  const gradesUndeclared =
    !declaresGraded &&
    !isQuiz &&
    (useQuestions === 'graded' ||
      questionComponents.some(isLiterallyGradedQuestion));
  if (gradesUndeclared) {
    d.error(
      `a question on this page is graded, but pageConfig does not declare graded: true, ` +
        'so its score never reaches the course score or passed/failed. Add graded: true to ' +
        'pageConfig, or drop graded from the question.',
    );
  }

  validateAssetRefs(content, assetsDir, d, assetExistsCache);
  validateQuestionComponents(questionComponents, d, profile);
  validateMediaComponents(content, d);
  validateHeadingOrder(content, d);
  validateContractBypass(content, d);
  if (
    (isQuiz || declaresGraded) &&
    useQuestions === 'absent' &&
    questionComponents.length === 0 &&
    !hasCustomWidget
  ) {
    d.warn(
      `${isQuiz ? 'quiz' : 'graded'} page has no question ` +
        `components or useQuestion() calls, so it will have nothing to score`,
    );
  } else if (
    declaresGraded &&
    !isQuiz &&
    !hasCustomWidget &&
    !questionComponents.some((q) => propMayBeTruthy(q, 'graded')) &&
    (useQuestions === 'absent' || useQuestions === 'none')
  ) {
    d.warn(
      `pageConfig.graded is set but no question on the page is graded. ` +
        `The page can never earn a score, so under completion.mode "percentage" it ` +
        `never completes. Mark at least one question component \`graded\`, or build one ` +
        `with useQuestion({ graded: true }).`,
    );
  }

  return {
    page: {
      fileRel,
      graded,
      requiredGraded,
      hasQuiz: isQuiz,
      weight,
      completesOnView,
    },
    parseError: false,
  };
}

export function validatePages(
  projectRoot: string,
  d: Diagnostics,
  profile: StandardProfile | undefined,
): PagesValidationResult {
  const ctx: PageContext = {
    projectRoot,
    d,
    profile,
    assetsDir: resolve(projectRoot, 'assets'),
    assetExistsCache: new Map(),
  };
  const pagesDir = resolve(projectRoot, 'pages');
  const pages: PageInfo[] = [];
  let hasParseErrors = false;

  const noPages = (): PagesValidationResult => {
    d.error(
      'No pages found. Create at least one section with a lesson and page in pages/',
    );
    return { hasParseErrors: false, pages: [] };
  };

  if (!existsSync(pagesDir)) return noPages();

  const validateMeta = (metaPath: string) =>
    d.within(relative(projectRoot, metaPath), () =>
      validateMetaFile(metaPath, d),
    );
  const warnAbout = (path: string, message: string) =>
    d.within(relative(projectRoot, path), () => d.warn(message));

  const course = walkPages(pagesDir);
  for (const entry of course.strayFiles) {
    warnAbout(
      resolve(pagesDir, entry),
      'this file is outside the section/lesson structure and will be ignored',
    );
  }
  for (const path of course.unresolved) {
    warnAbout(
      path,
      'symlink does not resolve, so it is left out of the course',
    );
  }

  for (const section of course.sections) {
    const pagesBeforeSection = pages.length;

    const sectionMeta = validateMeta(section.metaPath);

    for (const lesson of section.lessons) {
      // Flat lesson uses the section _meta, already validated above.
      const meta =
        lesson.name === null ? sectionMeta : validateMeta(lesson.metaPath);
      d.within(relative(projectRoot, lesson.metaPath), () =>
        validatePageList(lesson, meta?.pages, d),
      );

      // Same ordering as generateManifest.
      for (const fileName of orderPageFiles(lesson.files, meta?.pages)) {
        const filePath = resolve(lesson.dir, fileName);
        const { page, parseError } = d.within(
          relative(projectRoot, filePath),
          () => validatePageFile(filePath, ctx),
        );
        hasParseErrors ||= parseError;
        pages.push(page);
      }
    }

    // The page-count delta covers both the no-lessons and empty-lessons cases.
    if (pages.length === pagesBeforeSection) {
      warnAbout(section.dir, 'section contributed no pages and will be empty');
    }
  }

  if (pages.length === 0) return noPages();

  return { hasParseErrors, pages };
}

function validatePageList(
  lesson: WalkedLesson,
  pages: string[] | undefined,
  d: Diagnostics,
): void {
  if (!pages) return;
  const listed = new Map<string, string>();
  for (const pageName of pages) {
    const fileName = ensureSvelteSuffix(pageName);
    const first = listed.get(fileName);
    if (first !== undefined) {
      const repeated =
        first === pageName
          ? `${formatValue(pageName)} more than once`
          : `the same page as ${formatValue(first)} and ${formatValue(pageName)}`;
      d.warn(`pages array lists ${repeated}, so only the first entry counts`);
      continue;
    }
    listed.set(fileName, pageName);
    if (!lesson.files.includes(fileName)) {
      d.error(
        `pages array lists ${formatValue(pageName)} but ${fileName} not found in this directory`,
      );
    }
  }
  if (listed.size > 0) {
    for (const file of lesson.files) {
      if (!listed.has(file)) {
        d.warn(
          `pages array does not list ${file}, so it is appended at the end`,
        );
      }
    }
  }
}

function validateMetaFile(metaPath: string, d: Diagnostics): MetaFile | null {
  const { meta, problem, rejected = {} } = readMetaFile(metaPath);
  if (problem === 'missing') return null;
  if (problem) {
    d.error(`${READ_FAILURE_MESSAGES[problem]}`);
    return null;
  }

  if ('title' in rejected) {
    d.error(`"title" must be a string, got ${describeType(rejected.title)}`);
  } else if (!meta.title) {
    d.error(`missing required "title" field`);
  }
  if ('pages' in rejected) {
    d.error(
      `"pages" must be an array of page file names, got ${formatValue(rejected.pages)}`,
    );
  }

  return meta;
}

function validatePageConfig(
  content: string,
  d: Diagnostics,
): Partial<Record<keyof PageConfig, unknown>> | null {
  if (usesLegacyModuleContext(content)) {
    d.error(`<script context="module"> is not supported; use <script module>`);
  }
  const result = parsePageConfigFromSource(content);
  if (result.kind === 'ok') {
    for (const key of Object.keys(result.value)) {
      if (!KNOWN_PAGE_FIELDS.has(key))
        d.warn(`unknown field pageConfig.${key} is ignored`);
    }
    return result.value;
  }
  if (result.kind === 'invalid') {
    d.error(`pageConfig ${STATIC_LITERAL_RULE}`);
  }
  return null;
}

const KNOWN_PAGE_FIELDS = new Set(
  Object.keys({
    title: true,
    quiz: true,
    graded: true,
    required: true,
    weight: true,
    completesOn: true,
  } satisfies Record<keyof PageConfig, true>),
);

// A local import may wrap useQuestion, so its presence suppresses the "no
// questions" warning: false negatives are fine for an advisory heuristic.
function hasLocalModuleImport(content: string): boolean {
  return scriptImports(content).some(({ from }) => {
    if (!/^(?:\.{1,2}\/|\$)/.test(from)) return false;
    const file = from.slice(from.lastIndexOf('/') + 1);
    return !file.includes('.') || /\.(?:svelte|js|ts)$/.test(file);
  });
}

function splitsAcrossBranches(questions: ComponentMatch[]): boolean {
  const seen = new Map<number, string>();
  for (const { branches } of questions) {
    for (const [block, branch] of branches) {
      if ((seen.get(block) ?? branch) !== branch) return true;
      seen.set(block, branch);
    }
  }
  return false;
}

function validateBoolean(
  value: unknown,
  label: string,
  d: Diagnostics,
): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  d.error(`${label} must be a boolean, got ${formatValue(value)}`);
  return undefined;
}

function validatePageWeight(
  weight: unknown,
  d: Diagnostics,
): number | undefined {
  if (weight === undefined) return undefined;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    d.warn(
      `pageConfig.weight ${formatValue(weight)} is not a positive finite number and is ignored (treated as 1)`,
    );
    return undefined;
  }
  return weight;
}

const KNOWN_QUIZ_FIELDS = new Set(
  Object.keys({
    graded: true,
    gatesProgress: true,
    maxAttempts: true,
    feedbackMode: true,
    retryMode: true,
  } satisfies Record<keyof QuizConfig, true>),
);
const PAGE_LEVEL_FIELDS = new Set<string>([
  'required',
  'weight',
  'completesOn',
] satisfies (keyof PageConfig)[]);

function validateQuizConfig(quiz: unknown, d: Diagnostics): void {
  if (quiz == null || quiz === false) return;
  if (!isRecord(quiz)) {
    d.error(`pageConfig.quiz must be an object, got ${describeType(quiz)}`);
    return;
  }

  if (quiz.maxAttempts !== undefined) {
    const val = quiz.maxAttempts;
    if (typeof val !== 'number' || !(val > 0)) {
      d.error(
        `quiz.maxAttempts must be a positive number or Infinity, got ${formatValue(val)}`,
      );
    }
  }

  for (const field of ['graded', 'gatesProgress']) {
    validateBoolean(quiz[field], `quiz.${field}`, d);
  }

  for (const key of Object.keys(quiz)) {
    if (KNOWN_QUIZ_FIELDS.has(key)) continue;
    d.warn(
      PAGE_LEVEL_FIELDS.has(key)
        ? `quiz.${key} is ignored. Set ${key} on pageConfig, beside quiz.`
        : `unknown field quiz.${key} is ignored`,
    );
  }

  checkOneOf(`quiz.feedbackMode`, FEEDBACK_MODES, quiz.feedbackMode, d);
  checkOneOf(`quiz.retryMode`, RETRY_MODES, quiz.retryMode, d);
}

/**
 * Rule 1.6: warn on a skipped heading level (e.g. h2 → h4). No "one h1 per
 * page" check: the layout owns the page h1 and child components emit headings
 * a static scan can't see; that belongs to the Tier-2 audit.
 */
function validateHeadingOrder(content: string, d: Diagnostics): void {
  let prevSeen: number | null = null;
  for (const level of headingLevels(content)) {
    if (prevSeen !== null && level - prevSeen > 1) {
      d.warn(
        tag(
          A11Y_IDS.headingOrder,
          `heading level jumps from h${prevSeen} to h${level}. Don't skip levels (WCAG 1.3.1)`,
        ),
      );
    }
    prevSeen = level;
  }
}

const QUIZ_COMPLETE_DISPATCH_RE =
  /(?:new\s+CustomEvent\s*\(\s*['"]tessera-quiz-complete['"]|dispatchEvent\s*\([\s\S]{0,120}tessera-quiz-complete)/;
const RUNTIME_INTERNAL_IMPORT_RE = /from\s+['"]tessera-learn\/runtime\//;

/**
 * Detect ways an author file can bypass the LMS data contract. These check
 * source text for known escape hatches; they never inspect course content,
 * so they constrain how you wire things up, not what you build.
 */
function validateContractBypass(content: string, d: Diagnostics): void {
  if (QUIZ_COMPLETE_DISPATCH_RE.test(content)) {
    d.error(
      `dispatches "tessera-quiz-complete" directly. The event is a ` +
        `notification, not the scoring path; call useQuiz().submit() instead`,
    );
  }
  if (RUNTIME_INTERNAL_IMPORT_RE.test(content)) {
    d.error(
      `imports from tessera-learn/runtime/*. Use the public hooks ` +
        `(useQuiz, useQuestion, useNavigation, …) instead`,
    );
  }
}

export const SHELL_FILES = ['layout.svelte', 'quiz.svelte'];

export function validateShells(projectRoot: string, d: Diagnostics): void {
  for (const shellFile of SHELL_FILES) {
    const shellPath = resolve(projectRoot, shellFile);
    if (existsSync(shellPath)) {
      d.within(shellFile, () =>
        validateContractBypass(readFileSync(shellPath, 'utf-8'), d),
      );
    }
  }
}
