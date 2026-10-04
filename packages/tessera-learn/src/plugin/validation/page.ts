import { existsSync, readdirSync, statSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import JSON5 from 'json5';
import {
  extractDefaultExportObjectLiteral,
  parsePageConfigFromSource,
  readSourceFileCached,
  ensureSvelteSuffix,
  orderPageFiles,
  walkPages,
  isLiterallyGradedQuestion,
  listedGradedQuestions,
  QUESTION_COMPONENT_NAMES,
  type WalkedLesson,
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
  isRequiredGradedPage,
  type QuizConfig,
} from '../../runtime/types.js';
import { A11Y_IDS, tag, type Diagnostics } from './diagnostics.js';
import { validateAssetRefs, validateMediaComponents } from './media.js';
import { validateQuestionComponents } from './question.js';

export interface PageInfo {
  fileRel: string;
  navIndex: number;
  graded: boolean;
  requiredGraded: boolean;
  hasQuiz: boolean;
  weight?: number;
  completesOnView: boolean;
}

export interface PagesValidationResult {
  totalPages: number;
  totalQuizzes: number;
  hasParseErrors: boolean;
  pages: PageInfo[];
}

export class ProjectValidator {
  readonly assetsDir: string;
  // One existsSync per unique asset for the whole pass.
  readonly assetExistsCache = new Map<string, boolean>();

  constructor(
    readonly projectRoot: string,
    readonly d: Diagnostics,
    readonly profile: StandardProfile | undefined,
  ) {
    this.assetsDir = resolve(projectRoot, 'assets');
  }

  /**
   * Validate a single page .svelte file. Used for both section-level (flat) and
   * lesson-level pages — the validation is identical, only the containing
   * directory differs.
   */
  validatePageFile(
    filePath: string,
    navIndex: number,
  ): {
    page: PageInfo;
    isQuiz: boolean;
    parseError: boolean;
  } {
    const { projectRoot, d } = this;
    const fileRel = relative(projectRoot, filePath);
    const content = readSourceFileCached(filePath);

    const parseError = getParseError(content);
    if (parseError) {
      d.error(`${fileRel}: could not parse — ${parseError}`);
      return {
        page: {
          fileRel,
          navIndex,
          graded: false,
          requiredGraded: false,
          hasQuiz: false,
          completesOnView: false,
        },
        isQuiz: false,
        parseError: true,
      };
    }

    const pageConfig = validatePageConfig(content, fileRel, d);

    const isQuiz = !!pageConfig?.quiz;
    let isGradedQuiz = false;
    if (pageConfig?.quiz) {
      validateQuizConfig(pageConfig.quiz, fileRel, d);
      if ((pageConfig.quiz as { graded?: unknown }).graded === true) {
        isGradedQuiz = true;
      }
    }

    const completesOnView = validateCompletesOn(pageConfig, fileRel, d);
    const declaresGraded =
      validateBoolean(pageConfig?.graded, 'pageConfig.graded', fileRel, d) ??
      false;
    const declaresRequired = validateBoolean(
      pageConfig?.required,
      'pageConfig.required',
      fileRel,
      d,
    );
    const weight = validatePageWeight(pageConfig, fileRel, d);
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

    validateAssetRefs(
      content,
      fileRel,
      this.assetsDir,
      d,
      this.assetExistsCache,
    );
    validateQuestionComponents(questionComponents, fileRel, d, this.profile);
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
        navIndex,
        graded,
        requiredGraded,
        hasQuiz: isQuiz,
        ...(weight !== undefined ? { weight } : {}),
        completesOnView,
      },
      isQuiz,
      parseError: false,
    };
  }

  validatePages(): PagesValidationResult {
    const { projectRoot, d } = this;
    const pagesDir = resolve(projectRoot, 'pages');
    const pages: PageInfo[] = [];
    let totalPages = 0;
    let totalQuizzes = 0;
    let hasParseErrors = false;

    const noPages = (): PagesValidationResult => {
      d.error(
        'No pages found. Create at least one section with a lesson and page in pages/',
      );
      return { totalPages, totalQuizzes, hasParseErrors, pages };
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

    const sections = walkPages(pagesDir);
    if (sections.length === 0) return noPages();

    // For a flat lesson `meta` is the section's _meta. Same ordering as generateManifest.
    const validateLesson = (
      lesson: WalkedLesson,
      meta: { pages?: string[] } | null,
    ): void => {
      if (meta?.pages) {
        for (const pageName of meta.pages) {
          const fileName = ensureSvelteSuffix(pageName);
          if (!lesson.files.includes(fileName)) {
            d.error(
              `${relative(projectRoot, lesson.metaPath)}: pages array lists "${pageName}" but ${fileName} not found in this directory`,
            );
          }
        }
      }
      if (meta?.pages && meta.pages.length > 0) {
        const listedSet = new Set(meta.pages.map(ensureSvelteSuffix));
        for (const file of lesson.files) {
          if (!listedSet.has(file)) {
            d.warn(
              `${relative(projectRoot, resolve(lesson.dir, file))}: not listed in _meta.js pages array — will be appended at end`,
            );
          }
        }
      }

      for (const fileName of orderPageFiles(lesson.files, meta?.pages)) {
        const result = this.validatePageFile(
          resolve(lesson.dir, fileName),
          totalPages,
        );
        totalPages++;
        if (result.isQuiz) totalQuizzes++;
        if (result.parseError) hasParseErrors = true;
        pages.push(result.page);
      }
    };

    for (const section of sections) {
      const sectionRel = relative(projectRoot, section.dir);
      const pagesBeforeSection = totalPages;

      const sectionMeta = validateMetaFile(section.metaPath, sectionRel, d);

      for (const lesson of section.lessons) {
        if (lesson.name === null) {
          // Flat lesson uses the section _meta, already validated above.
          validateLesson(lesson, sectionMeta);
        } else {
          const meta = validateMetaFile(
            lesson.metaPath,
            relative(projectRoot, lesson.dir),
            d,
          );
          validateLesson(lesson, meta);
        }
      }

      // The page-count delta covers both the no-lessons and empty-lessons cases.
      if (totalPages === pagesBeforeSection) {
        d.warn(`${sectionRel}: section contributed no pages and will be empty`);
      }
    }

    if (totalPages === 0) return noPages();

    return { totalPages, totalQuizzes, hasParseErrors, pages };
  }

  validateShellFiles(): void {
    for (const shellFile of ['layout.svelte', 'quiz.svelte']) {
      const shellPath = resolve(this.projectRoot, shellFile);
      if (existsSync(shellPath)) {
        validateContractBypass(
          readSourceFileCached(shellPath),
          shellFile,
          this.d,
        );
      }
    }
  }
}

// ---------- _meta.js Validation ----------

function validateMetaFile(
  metaPath: string,
  parentRel: string,
  d: Diagnostics,
): { title?: string; pages?: string[] } | null {
  if (!existsSync(metaPath)) return null;

  const metaRel = `${parentRel}/_meta.js`;
  const result = extractDefaultExportObjectLiteral(
    readSourceFileCached(metaPath),
  );

  if (result.kind === 'parse-error') {
    d.error(`${metaRel}: could not parse — JavaScript syntax error`);
    return null;
  }
  if (result.kind !== 'literal') {
    d.error(`${metaRel}: syntax error — must export default { title: "..." }`);
    return null;
  }

  let meta: { title?: string; pages?: string[] };
  try {
    meta = JSON5.parse(result.text);
  } catch {
    d.error(`${metaRel}: syntax error — must export default { title: "..." }`);
    return null;
  }

  if (!meta.title) {
    d.error(`${metaRel}: missing required "title" field`);
  }

  return meta;
}

// ---------- pageConfig Validation ----------

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
    d.error(
      `${fileRel}: pageConfig must be a static object literal (no variables, function calls, or computed values)`,
    );
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

function validateCompletesOn(
  pageConfig: { completesOn?: unknown } | null,
  fileRel: string,
  d: Diagnostics,
): boolean {
  if (!pageConfig || pageConfig.completesOn === undefined) return false;
  if (pageConfig.completesOn === 'view') return true;
  d.error(
    `${fileRel}: pageConfig.completesOn must be "view", got ${JSON.stringify(pageConfig.completesOn)}`,
  );
  return false;
}

function validateBoolean(
  value: unknown,
  label: string,
  fileRel: string,
  d: Diagnostics,
): boolean | undefined {
  if (value === undefined || typeof value === 'boolean') return value;
  d.error(
    `${fileRel}: ${label} must be a boolean, got ${JSON.stringify(value)}`,
  );
  return undefined;
}

function validatePageWeight(
  pageConfig: { weight?: unknown } | null,
  fileRel: string,
  d: Diagnostics,
): number | undefined {
  const weight = pageConfig?.weight;
  if (weight === undefined) return undefined;
  if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
    d.warn(
      `${fileRel}: pageConfig.weight ${JSON.stringify(weight)} is not a positive finite number and is ignored (treated as 1)`,
    );
    return undefined;
  }
  return weight;
}

// ---------- Quiz Config Validation ----------

const VALID_FEEDBACK_MODES: readonly string[] = FEEDBACK_MODES;
const VALID_RETRY_MODES: readonly string[] = RETRY_MODES;

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
  if (!quiz || typeof quiz !== 'object') return;
  const cfg = quiz as Record<string, unknown>;

  if (cfg.maxAttempts !== undefined) {
    const val = cfg.maxAttempts;
    if (
      val !== Infinity &&
      (typeof val !== 'number' || val <= 0 || !Number.isFinite(val))
    ) {
      d.error(
        `${fileRel}: quiz.maxAttempts must be a positive number or Infinity, got ${String(val)}`,
      );
    }
  }

  for (const field of ['graded', 'gatesProgress']) {
    validateBoolean(cfg[field], `quiz.${field}`, fileRel, d);
  }

  for (const key of Object.keys(cfg)) {
    if (KNOWN_QUIZ_FIELDS.has(key)) continue;
    d.warn(
      PAGE_LEVEL_FIELDS.has(key)
        ? `${fileRel}: quiz.${key} is ignored. Set ${key} on pageConfig, beside quiz.`
        : `${fileRel}: unknown field quiz.${key} is ignored`,
    );
  }

  if (
    cfg.feedbackMode !== undefined &&
    !VALID_FEEDBACK_MODES.includes(cfg.feedbackMode as string)
  ) {
    d.error(
      `${fileRel}: quiz.feedbackMode must be "review", "immediate", or "never", got "${String(cfg.feedbackMode)}"`,
    );
  }
  if (
    cfg.retryMode !== undefined &&
    !VALID_RETRY_MODES.includes(cfg.retryMode as string)
  ) {
    d.error(
      `${fileRel}: quiz.retryMode must be "full" or "incorrect-only", got "${String(cfg.retryMode)}"`,
    );
  }
}

// ---------- Heading Order Validation (rule 1.6) ----------

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
 * Warn on a skipped heading level (e.g. h2 → h4). Scripts, styles, and comments
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

// ---------- Contract Bypass Detection ----------

const QUIZ_COMPLETE_DISPATCH_RE =
  /(?:new\s+CustomEvent\s*\(\s*['"]tessera-quiz-complete['"]|dispatchEvent\s*\([\s\S]{0,120}tessera-quiz-complete)/;
const RUNTIME_INTERNAL_IMPORT_RE = /from\s+['"]tessera-learn\/runtime\//;

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
