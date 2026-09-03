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

  it('reshapes an array-shaped launch actor into an Agent', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        name: ['Learner Name'],
        account: [
          {
            accountServiceHomePage: 'http://cloud.scorm.com',
            accountName: 'APPID|learner@example.com',
          },
        ],
        objectType: 'Agent',
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor).toEqual({
      name: 'Learner Name',
      account: {
        homePage: 'http://cloud.scorm.com',
        name: 'APPID|learner@example.com',
      },
      objectType: 'Agent',
    });
    const stateUrl = String(
      fetchMock.mock.calls.find(([u]) =>
        String(u).includes('activities/state'),
      )![0],
    );
    expect(stateUrl).toContain(encodeURIComponent('"homePage"'));
  });

  it('reshapes a Person with several IFIs down to its account', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        objectType: 'Person',
        name: ['Learner Name'],
        mbox: ['mailto:learner@example.com'],
        account: [
          {
            accountServiceHomePage: 'http://cloud.scorm.com',
            accountName: 'APPID|learner@example.com',
          },
        ],
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor).toEqual({
      objectType: 'Agent',
      name: 'Learner Name',
      account: {
        homePage: 'http://cloud.scorm.com',
        name: 'APPID|learner@example.com',
      },
    });
  });

  it('keeps the account when a Person-shaped actor is labelled Agent', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        objectType: 'Agent',
        name: ['Learner Name'],
        mbox: ['mailto:learner@example.com'],
        account: [
          {
            accountServiceHomePage: 'http://cloud.scorm.com',
            accountName: 'APPID|learner@example.com',
          },
        ],
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor).toEqual({
      objectType: 'Agent',
      name: 'Learner Name',
      account: {
        homePage: 'http://cloud.scorm.com',
        name: 'APPID|learner@example.com',
      },
    });
  });

  it('normalizes a member-less Group launch actor to an Agent', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        objectType: 'Group',
        name: 'Learner Name',
        account: {
          homePage: 'http://cloud.scorm.com',
          name: 'APPID|learner@example.com',
        },
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor.objectType).toBe('Agent');
  });

  it('maps account key aliases on an unwrapped account object', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        objectType: 'Agent',
        name: 'Learner Name',
        account: {
          accountServiceHomePage: 'http://cloud.scorm.com',
          accountName: 'APPID|learner@example.com',
        },
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor).toEqual({
      objectType: 'Agent',
      name: 'Learner Name',
      account: {
        homePage: 'http://cloud.scorm.com',
        name: 'APPID|learner@example.com',
      },
    });
  });

  it('sends nothing after init rejects an actor it cannot reshape', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({ name: 'Learner Name' }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    expect(
      fetchMock.mock.calls.find(([u]) => String(u).includes('/statements')),
    ).toBeFalsy();
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
  it('falls through to the mbox when the account has no homePage', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        objectType: 'Person',
        name: ['Learner Name'],
        mbox: ['mailto:learner@example.com'],
        account: [{ accountName: 'APPID|learner@example.com' }],
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor).toEqual({
      objectType: 'Agent',
      name: 'Learner Name',
      mbox: 'mailto:learner@example.com',
    });
  });

  it('drops an empty member array instead of reading it as a Group', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({
        objectType: 'Group',
        member: [],
        account: { homePage: 'http://cloud.scorm.com', name: 'APPID|l' },
      }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await adapter.init();
    adapter.setCompletionStatus('complete');
    await new Promise((r) => setTimeout(r, 0));
    const send = fetchMock.mock.calls.find(([u]) =>
      String(u).includes('/statements'),
    );
    expect(JSON.parse(send![1].body).actor).toEqual({
      objectType: 'Agent',
      account: { homePage: 'http://cloud.scorm.com', name: 'APPID|l' },
    });
  });

  it('stops State API writes after the actor fails validation', async () => {
    launch({
      endpoint: 'https://lrs.example/xapi',
      auth: 'Basic Zm9vOmJhcg==',
      actor: JSON.stringify({ name: 'Learner Name' }),
      activity_id: 'urn:tessera:au:abc',
    });
    const adapter = new XAPIAdapter();
    await expect(adapter.init()).rejects.toThrow(/actor/);
    adapter.saveState({ page: 1 } as never);
    await new Promise((r) => setTimeout(r, 0));
    expect(
      fetchMock.mock.calls.find(([u]) =>
        String(u).includes('activities/state'),
      ),
    ).toBeFalsy();
  });
});
