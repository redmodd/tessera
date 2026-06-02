import { describe, it, expect } from 'vitest';
import {
  axeTags,
  axeIgnoreRules,
  isMissingBrowserError,
  mapNodeDetail,
  mapViolation,
} from '../src/plugin/a11y/audit.js';

describe('axeTags', () => {
  it('maps each standard to its cumulative tag list', () => {
    expect(axeTags('wcag2a')).toEqual(['wcag2a']);
    expect(axeTags('wcag2aa')).toEqual(['wcag2a', 'wcag2aa']);
    expect(axeTags('wcag21aa')).toEqual([
      'wcag2a',
      'wcag2aa',
      'wcag21a',
      'wcag21aa',
    ]);
  });
});

describe('axeIgnoreRules', () => {
  it('keeps only bare axe rule IDs, dropping tessera/ and a11y_ namespaces', () => {
    const ignore = [
      'tessera/image-alt',
      'a11y_missing_attribute',
      'image-alt',
      'color-contrast',
    ];
    expect(axeIgnoreRules(ignore)).toEqual(['image-alt', 'color-contrast']);
  });
});

describe('mapNodeDetail', () => {
  it('joins the target selector, keeps the html, and collapses the summary', () => {
    expect(
      mapNodeDetail({
        target: ['.how-to-play', '.hint'],
        html: '<p class="hint">Tap a sign</p>',
        failureSummary:
          'Fix any of the following:\n  Element has insufficient color contrast of 3.1',
      }),
    ).toEqual({
      target: '.how-to-play .hint',
      html: '<p class="hint">Tap a sign</p>',
      summary:
        'Fix any of the following: Element has insufficient color contrast of 3.1',
    });
  });

  it('truncates over-long html and tolerates missing fields', () => {
    const result = mapNodeDetail({ html: 'x'.repeat(500) });
    expect(result.target).toBe('');
    expect(result.summary).toBe('');
    expect(result.html).toHaveLength(200);
    expect(result.html.endsWith('…')).toBe(true);
  });
});

describe('mapViolation', () => {
  it('keeps the count and expands per-node detail', () => {
    const result = mapViolation({
      id: 'color-contrast',
      impact: 'serious',
      help: 'Elements must meet minimum color contrast ratio thresholds',
      helpUrl: 'https://example.test/color-contrast',
      nodes: [
        {
          target: ['.hint'],
          html: '<p class="hint">x</p>',
          failureSummary: 'Expected contrast ratio of 4.5:1',
        },
      ],
    });
    expect(result.nodes).toBe(1);
    expect(result.elements).toEqual([
      {
        target: '.hint',
        html: '<p class="hint">x</p>',
        summary: 'Expected contrast ratio of 4.5:1',
      },
    ]);
  });

  it('normalizes a missing impact to null', () => {
    const result = mapViolation({
      id: 'region',
      help: 'h',
      helpUrl: 'u',
      nodes: [],
    });
    expect(result.impact).toBeNull();
    expect(result.elements).toEqual([]);
  });
});

describe('isMissingBrowserError', () => {
  it('matches Playwright "Executable doesn\'t exist" errors', () => {
    expect(
      isMissingBrowserError(
        "browserType.launch: Executable doesn't exist at /home/.cache/ms-playwright/chromium-1/chrome",
      ),
    ).toBe(true);
  });

  it('matches messages telling you to run playwright install', () => {
    expect(
      isMissingBrowserError(
        'Please run the following command to download new browsers:\nnpx playwright install',
      ),
    ).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isMissingBrowserError('connect ECONNREFUSED 127.0.0.1:5173')).toBe(
      false,
    );
  });
});
