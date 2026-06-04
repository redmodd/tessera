import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  axeTags,
  axeIgnoreRules,
  installChromium,
  isMissingBrowserError,
  launchWithInstall,
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

const MISSING_BROWSER = "Executable doesn't exist at /cache/chromium/chrome";

describe('launchWithInstall', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns the browser on first try without installing (common path)', async () => {
    const install = vi.fn(async () => true);
    const browser = { id: 'b' };
    const result = await launchWithInstall({
      launch: vi.fn(async () => browser),
      install,
    });
    expect(result).toEqual({ ok: true, browser });
    expect(install).not.toHaveBeenCalled();
  });

  it('installs then retries the launch when the browser is missing', async () => {
    const browser = { id: 'b' };
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error(MISSING_BROWSER))
      .mockResolvedValueOnce(browser);
    const install = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const result = await launchWithInstall({ launch, install });

    expect(result).toEqual({ ok: true, browser });
    expect(install).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('falls back to the instructional message when the install fails', async () => {
    const launch = vi.fn().mockRejectedValue(new Error(MISSING_BROWSER));
    const install = vi.fn(async () => false);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await launchWithInstall({ launch, install });

    expect(result).toEqual({ ok: false, code: 1 });
    expect(launch).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0][0]).toContain('playwright install chromium');
  });

  it('guards a failed retry launch instead of throwing, with the Linux hint', async () => {
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error(MISSING_BROWSER))
      .mockRejectedValueOnce(new Error('libnss3.so: cannot open'));
    const install = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await launchWithInstall({ launch, install, isLinux: true });

    expect(result).toEqual({ ok: false, code: 1 });
    const msg = error.mock.calls[0][0];
    expect(msg).toContain('failed to launch');
    expect(msg).toContain('--with-deps');
    expect(msg).toContain('libnss3.so: cannot open');
  });

  it('points back at the install (not --with-deps) when the binary is still missing after install', async () => {
    const launch = vi.fn().mockRejectedValue(new Error(MISSING_BROWSER));
    const install = vi.fn(async () => true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await launchWithInstall({ launch, install, isLinux: true });

    expect(result).toEqual({ ok: false, code: 1 });
    const msg = error.mock.calls[0][0];
    expect(msg).toContain('playwright install chromium');
    expect(msg).not.toContain('--with-deps');
  });

  it('omits the --with-deps hint off Linux', async () => {
    const launch = vi
      .fn()
      .mockRejectedValueOnce(new Error(MISSING_BROWSER))
      .mockRejectedValueOnce(new Error('boom'));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    await launchWithInstall({
      launch,
      install: async () => true,
      isLinux: false,
    });

    expect(error.mock.calls[0][0]).not.toContain('--with-deps');
  });

  it('rethrows a non-missing-browser error without installing', async () => {
    const launch = vi.fn().mockRejectedValue(new Error('boom'));
    const install = vi.fn(async () => true);

    await expect(launchWithInstall({ launch, install })).rejects.toThrow(
      'boom',
    );
    expect(install).not.toHaveBeenCalled();
  });
});

function fakeSpawn(behavior: 'exit0' | 'exit1' | 'error') {
  const calls: { command: string; args: string[] }[] = [];
  const fn = (command: string, args: string[]) => {
    calls.push({ command, args });
    return {
      on(event: string, listener: (arg?: number | null | Error) => void) {
        if (event === 'exit' && behavior !== 'error') {
          listener(behavior === 'exit0' ? 0 : 1);
        }
        if (event === 'error' && behavior === 'error') {
          listener(new Error('spawn ENOENT'));
        }
        return this;
      },
    };
  };
  return { fn, calls };
}

describe('installChromium', () => {
  afterEach(() => vi.restoreAllMocks());

  it('runs the resolved playwright bin with the current Node binary', async () => {
    const spawn = fakeSpawn('exit0');
    const ok = await installChromium('/workspace', spawn.fn);

    expect(ok).toBe(true);
    expect(spawn.calls[0].command).toBe(process.execPath);
    expect(spawn.calls[0].args[0]).toMatch(/cli\.js$/);
    expect(spawn.calls[0].args.slice(1)).toEqual(['install', 'chromium']);
  });

  it('returns false on a non-zero exit', async () => {
    const ok = await installChromium('/workspace', fakeSpawn('exit1').fn);
    expect(ok).toBe(false);
  });

  it('logs a breadcrumb and returns false on a spawn error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const ok = await installChromium('/workspace', fakeSpawn('error').fn);

    expect(ok).toBe(false);
    expect(error.mock.calls[0][0]).toContain('spawn ENOENT');
  });
});
