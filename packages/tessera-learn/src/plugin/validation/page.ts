import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import {
  parsePageConfigFromSource,
  readMetaFile,
  readSourceFileCached,
  ensureSvelteSuffix,
  orderPageFiles,
  walkPages,
  isLiterallyGradedQuestion,
  listedGradedQuestions,
  QUESTION_COMPONENT_NAMES,
  type MetaFile,
  type PageConfig,
} from '../manifest.js';
import {
  findComponents,
  type ComponentMatch,
  getParseError,
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
  formatValue,
  READ_FAILURE_MESSAGES,
  STATIC_LITERAL_RULE,
  type Diagnostics,
} from './diagnostics.js';
import { validateAssetRefs, validateMediaComponents } from './media.js';
import { validateQuestionComponents } from './question.js';

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
  const content = readSourceFileCached(filePath);

  const parseError = getParseError(content);
  if (parseError) {
    d.error(`${fileRel}: could not parse — ${parseError}`);
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

  const pageConfig = validatePageConfig(content, fileRel, d);

  const quiz = pageConfig?.quiz;
  const isQuiz = !!quiz;
  const isGradedQuiz = isRecord(quiz) && quiz.graded === true;
  validateQuizConfig(quiz, fileRel, d);

  checkOneOf(
    `${fileRel}: pageConfig.completesOn`,
    ['view'],
    pageConfig?.completesOn,
    d,
  );
  const completesOnView = pageConfig?.completesOn === 'view';
  const declaresGraded =
    validateBoolean(pageConfig?.graded, 'pageConfig.graded', fileRel, d) ??
    false;
  const declaresRequired = validateBoolean(
    pageConfig?.required,
    'pageConfig.required',
    fileRel,
    d,
  );
  const weight = validatePageWeight(pageConfig?.weight, fileRel, d);
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
      `${fileRel}: pageConfig.graded is set on a quiz page whose quiz is not graded. ` +
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
        `${fileRel}: pageConfig.${field} only applies to a graded page. ` +
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
      `${fileRel}: graded questions sit in different branches of one {#if}, {#each} or {#await}. ` +
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
      `${fileRel}: a question on this page is graded, but pageConfig does not declare graded: true, ` +
        'so its score never reaches the course score or passed/failed. Add graded: true to ' +
        'pageConfig, or drop graded from the question.',
    );
  }

  validateAssetRefs(content, fileRel, assetsDir, d, assetExistsCache);
  validateQuestionComponents(questionComponents, fileRel, d, profile);
  validateMediaComponents(content, fileRel, d);
  validateHeadingOrder(content, fileRel, d);
  validateContractBypass(content, fileRel, d);
  if (
    (isQuiz || declaresGraded) &&
    useQuestions === 'absent' &&
    questionComponents.length === 0 &&
    !hasCustomWidget
  ) {
    d.warn(
      `${fileRel}: ${isQuiz ? 'quiz' : 'graded'} page has no question ` +
        `components or useQuestion() calls — it will have nothing to score`,
    );
  } else if (
    declaresGraded &&
    !isQuiz &&
    !hasCustomWidget &&
    !questionComponents.some(isGradedQuestion) &&
    (useQuestions === 'absent' || useQuestions === 'none')
  ) {
    d.warn(
      `${fileRel}: pageConfig.graded is set but no question on the page is graded — ` +
        `the page can never earn a score, so under completion.mode "percentage" it ` +
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

  // walkPages only descends into section dirs, so scan pages/ root separately.
  for (const entry of readdirSync(pagesDir)) {
    const fullPath = resolve(pagesDir, entry);
    if (entry.endsWith('.svelte') && statSync(fullPath).isFile()) {
      d.warn(
        `${relative(projectRoot, fullPath)}: this file is outside the section/lesson structure and will be ignored`,
      );
    }
  }

  for (const section of walkPages(pagesDir)) {
    const sectionRel = relative(projectRoot, section.dir);
    const pagesBeforeSection = pages.length;

    const sectionMeta = validateMetaFile(section.metaPath, projectRoot, d);

    for (const lesson of section.lessons) {
      // Flat lesson uses the section _meta, already validated above.
      const meta =
        lesson.name === null
          ? sectionMeta
          : validateMetaFile(lesson.metaPath, projectRoot, d);

      if (meta?.pages) {
        const listed = new Set(meta.pages.map(ensureSvelteSuffix));
        for (const pageName of meta.pages) {
          const fileName = ensureSvelteSuffix(pageName);
          if (!lesson.files.includes(fileName)) {
            d.error(
              `${relative(projectRoot, lesson.metaPath)}: pages array lists ${formatValue(pageName)} but ${fileName} not found in this directory`,
            );
          }
        }
        if (listed.size > 0) {
          for (const file of lesson.files) {
            if (!listed.has(file)) {
              d.warn(
                `${relative(projectRoot, resolve(lesson.dir, file))}: not listed in _meta.js pages array — will be appended at end`,
              );
            }
          }
        }
      }

      // Same ordering as generateManifest.
      for (const fileName of orderPageFiles(lesson.files, meta?.pages)) {
        const { page, parseError } = validatePageFile(
          resolve(lesson.dir, fileName),
          ctx,
        );
        hasParseErrors ||= parseError;
        pages.push(page);
      }
    }

    // The page-count delta covers both the no-lessons and empty-lessons cases.
    if (pages.length === pagesBeforeSection) {
      d.warn(`${sectionRel}: section contributed no pages and will be empty`);
    }
  }

  if (pages.length === 0) return noPages();

  return { hasParseErrors, pages };
}

function validateMetaFile(
  metaPath: string,
  projectRoot: string,
  d: Diagnostics,
): MetaFile | null {
  const { meta, problem } = readMetaFile(metaPath);
  if (problem === 'missing') return null;

  const metaRel = relative(projectRoot, metaPath);
  if (problem && problem !== 'invalid-pages') {
    d.error(`${metaRel}: ${READ_FAILURE_MESSAGES[problem]}`);
    return null;
  }

  if (!meta.title) {
    d.error(`${metaRel}: missing required "title" field`);
  }
  if (problem === 'invalid-pages') {
    d.error(`${metaRel}: "pages" must be an array of page file names`);
  }

  return meta;
}

function validatePageConfig(
  content: string,
  fileRel: string,
  d: Diagnostics,
): Partial<Record<keyof PageConfig, unknown>> | null {
  if (usesLegacyModuleContext(content)) {
    d.error(
      `${fileRel}: <script context="module"> is not supported; use <script module>`,
    );
  }
  const result = parsePageConfigFromSource(content);
  if (result.kind === 'ok') {
    for (const key of Object.keys(result.value)) {
      if (!KNOWN_PAGE_FIELDS.has(key))
        d.warn(`${fileRel}: unknown field pageConfig.${key} is ignored`);
    }
    return result.value;
  }
  if (result.kind === 'invalid') {
    d.error(`${fileRel}: pageConfig ${STATIC_LITERAL_RULE}`);
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

function isGradedQuestion({ props, hasSpread }: ComponentMatch): boolean {
  if (hasSpread) return true;
  const graded = props.get('graded');
  return !!graded && !(graded.kind === 'expr' && graded.raw === 'false');
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
  fileRel: string,
  d: Diagnostics,
): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  d.error(`${fileRel}: ${label} must be a boolean, got ${formatValue(value)}`);
  return undefined;
}

function validatePageWeight(
  weight: unknown,
  fileRel: string,
  d: Diagnostics,
): number | undefined {
  if (weight === undefined) return undefined;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    d.warn(
      `${fileRel}: pageConfig.weight ${formatValue(weight)} is not a positive finite number and is ignored (treated as 1)`,
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

function validateQuizConfig(
  quiz: unknown,
  fileRel: string,
  d: Diagnostics,
): void {
  if (!isRecord(quiz)) return;

  if (quiz.maxAttempts !== undefined) {
    const val = quiz.maxAttempts;
    if (typeof val !== 'number' || !(val > 0)) {
      d.error(
        `${fileRel}: quiz.maxAttempts must be a positive number or Infinity, got ${formatValue(val)}`,
      );
    }
  }

  for (const field of ['graded', 'gatesProgress']) {
    validateBoolean(quiz[field], `quiz.${field}`, fileRel, d);
  }

  for (const key of Object.keys(quiz)) {
    if (KNOWN_QUIZ_FIELDS.has(key)) continue;
    d.warn(
      PAGE_LEVEL_FIELDS.has(key)
        ? `${fileRel}: quiz.${key} is ignored. Set ${key} on pageConfig, beside quiz.`
        : `${fileRel}: unknown field quiz.${key} is ignored`,
    );
  }

  checkOneOf(
    `${fileRel}: quiz.feedbackMode`,
    FEEDBACK_MODES,
    quiz.feedbackMode,
    d,
  );
  checkOneOf(`${fileRel}: quiz.retryMode`, RETRY_MODES, quiz.retryMode, d);
}

/** Remove HTML/Svelte comments so commented-out markup isn't scanned as live. */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g;

const SCRIPT_STYLE_RE = /<(script|style)\b[\s\S]*?<\/\1>/gi;

// Loop until stable: one pass can leave a reconstructed tag behind (e.g. `<scr<script></script>ipt>`).
function stripRepeated(input: string, patterns: RegExp[]): string {
  let out = input;
  for (const pattern of patterns) {
    let prev: string;
    do {
      prev = out;
      out = out.replace(pattern, '');
    } while (out !== prev);
  }
  return out;
}

/**
 * Rule 1.6: warn on a skipped heading level (e.g. h2 → h4). Scripts, styles, and comments
 * are stripped first so string literals, CSS, and commented-out markup can't be
 * miscounted. No "one h1 per page" check — the layout owns the page h1 and child
 * components emit headings a static scan can't see; that belongs to the Tier-2
 * audit.
 */
function validateHeadingOrder(
  content: string,
  fileRel: string,
  d: Diagnostics,
): void {
  const html = stripRepeated(content, [SCRIPT_STYLE_RE, HTML_COMMENT_RE]);
  const levels = [...html.matchAll(/<h([1-6])\b/gi)].map((h) => Number(h[1]));
  let prevSeen: number | null = null;
  for (const level of levels) {
    if (prevSeen !== null && level - prevSeen > 1) {
      d.warn(
        tag(
          A11Y_IDS.headingOrder,
          `${fileRel}: heading level jumps from h${prevSeen} to h${level} — don't skip levels (WCAG 1.3.1)`,
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
 * source text for known escape hatches — they never inspect course content,
 * so they constrain how you wire things up, not what you build.
 */
function validateContractBypass(
  content: string,
  fileRel: string,
  d: Diagnostics,
): void {
  if (QUIZ_COMPLETE_DISPATCH_RE.test(content)) {
    d.error(
      `${fileRel}: dispatches "tessera-quiz-complete" directly. The event is a ` +
        `notification, not the scoring path; call useQuiz().submit() instead`,
    );
  }
  if (RUNTIME_INTERNAL_IMPORT_RE.test(content)) {
    d.error(
      `${fileRel}: imports from tessera-learn/runtime/* — use the public hooks ` +
        `(useQuiz, useQuestion, useNavigation, …) instead`,
    );
  }
}

export function validateShells(projectRoot: string, d: Diagnostics): void {
  for (const shellFile of ['layout.svelte', 'quiz.svelte']) {
    const shellPath = resolve(projectRoot, shellFile);
    if (existsSync(shellPath)) {
      validateContractBypass(readSourceFileCached(shellPath), shellFile, d);
    }
  }
}
