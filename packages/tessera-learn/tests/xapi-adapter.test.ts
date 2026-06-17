// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { XAPIAdapter } from '../src/runtime/adapters/xapi.js';

const ACTOR = {
  objectType: 'Agent',
  account: { homePage: 'https://lms', name: 'learner-1' },
};

function launch(params: Record<string, string>) {
  const qs = new URLSearchParams(params).toString();
  window.history.replaceState({}, '', `/?${qs}`);
}

describe('XAPIAdapter', () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 404 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/');
  });

  it('parses snake_case Tin Can launch params and sends the version header', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      // Tin Can launch sends the full "Basic <base64>" header value; the adapter
      // must strip the scheme so it doesn't double-prefix on the wire.
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify(ACTOR),
      activity_id: 'urn:tessera:au:abc',
      registration: '2d8b1e1e-0000-4000-8000-000000000000',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(send).toBeTruthy();
    const headers = send![1].headers as Headers;
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
    expect(headers.get('Authorization')).toBe('Basic Zm9vOmJhcg==');
  });

  it('throws on malformed actor JSON', async () => {
    launch({
      endpoint: 'https://lrs/',
      auth: 'x',
      actor: 'not-json',
      activity_id: 'a',
    });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
  });
});
