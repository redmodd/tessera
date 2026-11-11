import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { findComponents, isLiteralTrue } from '../ast.js';
import { isVideoEmbed } from '../../components/video-embed.js';
import { A11Y_IDS, tag } from './a11y.js';
import { formatValue, type Diagnostics } from './diagnostics.js';

const MEDIA_COMPONENT_NAMES: ReadonlySet<string> = new Set([
  'Image',
  'Video',
  'Audio',
]);

/**
 * Rules 1.3 / 1.4. Sibling to validateQuestionComponents kept out of QUESTION_COMPONENTS
 * so media isn't treated as gradable questions.
 * Non-static (kind 'expr') values are skipped, matching the rest of the linter.
 */
export function validateMediaComponents(content: string, d: Diagnostics): void {
  const components = findComponents(content, MEDIA_COMPONENT_NAMES);
  if (!components) return;
  for (const { name, props, hasSpread } of components) {
    if (name === 'Image') {
      const alt = props.get('alt');
      const decorative = props.get('decorative');
      // A string value is truthy at runtime (so decorative="false" hides the
      // image), but the parser sees a string, not a boolean, so flag the misuse.
      if (decorative?.kind === 'string') {
        d.error(
          tag(
            A11Y_IDS.imageAlt,
            `<Image> "decorative" must be a boolean. Use decorative or decorative={true}, not the string ${formatValue(decorative.value)}`,
          ),
        );
        continue;
      }
      const hasDecorative = isLiteralTrue(decorative);
      const altIsEmpty = alt?.kind === 'string' && alt.value.trim() === '';
      if (!hasDecorative && !hasSpread && (alt === undefined || altIsEmpty)) {
        d.error(
          tag(
            A11Y_IDS.imageAlt,
            '<Image> needs alt text, or mark it decorative={true} if purely ornamental',
          ),
        );
      }
      if (hasDecorative && alt?.kind === 'string' && alt.value.trim() !== '') {
        d.warn(
          tag(
            A11Y_IDS.imageAlt,
            '<Image> is decorative but also has alt text, so the alt will be dropped',
          ),
        );
      }
      continue;
    }

    if (hasSpread) continue;
    const title = props.get('title');
    const titleIsEmpty = title?.kind === 'string' && title.value.trim() === '';
    if (title === undefined || titleIsEmpty) {
      d.error(
        tag(
          A11Y_IDS.mediaTitle,
          `<${name}> needs a title, which is the accessible name for the player`,
        ),
      );
    }
    const src = props.get('src');
    const srcText =
      src?.kind === 'string'
        ? src.value
        : src?.kind === 'template'
          ? src.raw
          : undefined;
    const isEmbed = srcText !== undefined && isVideoEmbed(srcText);
    const hasTranscript = props.has('transcript');
    if (name === 'Video' && isEmbed && !hasTranscript) {
      d.warn(
        tag(
          A11Y_IDS.mediaTranscript,
          "<Video> embeds can't carry caption tracks, so provide a transcript for WCAG 1.2",
        ),
      );
    }
    if (
      name === 'Video' &&
      srcText !== undefined &&
      !isEmbed &&
      !props.has('tracks') &&
      !hasTranscript
    ) {
      d.warn(
        tag(
          A11Y_IDS.mediaCaptions,
          'native <Video> has no caption tracks or transcript. Add tracks={[…]} or a transcript for WCAG 1.2.2',
        ),
      );
    }
    if (name === 'Audio' && !hasTranscript) {
      d.warn(
        tag(
          A11Y_IDS.mediaTranscript,
          '<Audio> has no transcript, which WCAG 1.2.1 requires',
        ),
      );
    }
  }
}

const ASSET_REF_RE = /\$assets\/([^\s"'`)]+)/g;

/** Match $assets/... refs in any context (src attrs, import statements, url() etc) and dedupe. */
function collectAssetRefs(content: string): Set<string> {
  return new Set(
    Array.from(content.matchAll(ASSET_REF_RE), (m) => m[1].split(/[?#]/, 1)[0]),
  );
}

export function validateAssetRefs(
  content: string,
  assetsDir: string,
  d: Diagnostics,
  {
    existsCache = new Map<string, boolean>(),
    field,
  }: { existsCache?: Map<string, boolean>; field?: string } = {},
): void {
  const subject = field ? `"${field}": ` : '';
  for (const assetPath of collectAssetRefs(content)) {
    const fullAssetPath = resolve(assetsDir, assetPath);
    let exists = existsCache.get(fullAssetPath);
    if (exists === undefined) {
      exists = existsSync(fullAssetPath);
      existsCache.set(fullAssetPath, exists);
    }
    if (!exists) {
      d.warn(`${subject}"$assets/${assetPath}" not found in assets/ directory`);
    }
  }
}
