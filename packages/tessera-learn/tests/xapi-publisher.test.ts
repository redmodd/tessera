// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { XAPIPublisher, XAPIConfigError, XAPIStatementError, validateAgent, validateAuthCredential } from '../src/runtime/xapi/publisher.js';
import { XAPIClient } from '../src/runtime/xapi/client.js';
import type { XAPIAgent } from '../src/runtime/xapi/types.js';

const mockFetch = vi.fn();

function basicOpts(overrides: Partial<ConstructorParameters<typeof XAPIPublisher>[0]> = {}) {
  return {
    endpoint: 'https://lrs.example.com/xapi/',
    auth: 'tok',
    actor: { mbox: 'mailto:test@example.com', objectType: 'Agent' as const },
    activityId: 'https://example.com/courses/1',
    ...overrides,
  };
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.spyOn(globalThis, 'fetch').mockImplementation(mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateAgent', () => {
  it('accepts a well-formed mbox actor', () => {
    expect(validateAgent({ mbox: 'mailto:a@b.c' })).toBeNull();
  });
  it('rejects a non-object', () => {
    expect(validateAgent(null)).toMatch(/object/);
  });
  it('rejects an actor with zero IFIs', () => {
    expect(validateAgent({ name: 'a' })).toMatch(/Identified Agent/);
  });
  it('rejects two IFIs', () => {
    expect(
      validateAgent({ mbox: 'mailto:a@b.c', openid: 'https://e.com/u' })
    ).toMatch(/exactly one IFI/);
  });
  it('rejects malformed mbox', () => {
    expect(validateAgent({ mbox: 'a@b.c' })).toMatch(/mailto:/);
  });
  it('rejects malformed mbox_sha1sum', () => {
    expect(validateAgent({ mbox_sha1sum: 'abc' })).toMatch(/40-character hex/);
  });
  it('accepts a well-formed account', () => {
    expect(
      validateAgent({
        account: { homePage: 'https://lms.example.com', name: 'user1' },
      })
    ).toBeNull();
  });
  it('rejects a Group (with `member`)', () => {
    expect(
      validateAgent({ member: [{ mbox: 'mailto:a@b.c' }] })
    ).toMatch(/Group/);
  });
});

describe('validateAuthCredential', () => {
  it('accepts a plain credential', () => {
    expect(validateAuthCredential('tok')).toBeNull();
  });
  it('rejects empty', () => {
    expect(validateAuthCredential('')).toMatch(/non-empty/);
  });
  it('rejects "Basic " prefix', () => {
    expect(validateAuthCredential('Basic tok')).toMatch(/Drop the/);
  });
  it('rejects "Bearer " prefix (non-goal in v1)', () => {
    expect(validateAuthCredential('Bearer tok')).toMatch(/not supported/);
  });
});

describe('XAPIPublisher — construction', () => {
  it('throws when endpoint is not http(s)', () => {
    expect(() => new XAPIPublisher(basicOpts({ endpoint: 'ftp://x' as any }))).toThrow(
      /http\(s\)/
    );
  });
  it('throws when endpoint is missing', () => {
    expect(() => new XAPIPublisher(basicOpts({ endpoint: '' as any }))).toThrow(
      /endpoint/
    );
  });
  it('normalizes endpoint trailing slash', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const pub = new XAPIPublisher(
      basicOpts({ endpoint: 'https://lrs.example.com/xapi' as any })
    );
    await pub.init();
    await pub.sendStatement({ verb: { id: 'http://verb/x' } });
    expect(mockFetch.mock.calls[0][0]).toBe('https://lrs.example.com/xapi/statements');
  });
});

describe('XAPIPublisher — buildStatement', () => {
  it('mints a UUID', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const s1 = pub.buildStatement({ verb: { id: 'http://verb/a' } });
    const s2 = pub.buildStatement({ verb: { id: 'http://verb/a' } });
    expect(s1.id).not.toBe(s2.id);
    expect(s1.id).toMatch(/^[0-9a-f-]{36}$/i);
  });
  it('honors a caller-supplied id', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const s = pub.buildStatement(
      { verb: { id: 'http://verb/a' } },
      { id: 'fixed-id-123' }
    );
    expect(s.id).toBe('fixed-id-123');
  });
  it('defaults object to activityId Activity', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const s = pub.buildStatement({ verb: { id: 'http://verb/a' } });
    expect(s.object).toEqual({
      id: 'https://example.com/courses/1',
      objectType: 'Activity',
    });
  });
  it('attaches grouping[] = [activityId] in context', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const s = pub.buildStatement({ verb: { id: 'http://verb/a' } });
    expect(s.context?.contextActivities?.grouping).toEqual([
      { id: 'https://example.com/courses/1' },
    ]);
  });
  it('attaches cmi5 sessionid extension under cmi5Mode', async () => {
    const pub = new XAPIPublisher(basicOpts({ cmi5Mode: true, sessionId: 'sess-42' }));
    await pub.init();
    const s = pub.buildStatement({ verb: { id: 'http://verb/a' } });
    expect(s.context?.extensions?.[
      'https://w3id.org/xapi/cmi5/context/extensions/sessionid'
    ]).toBe('sess-42');
  });
  it('omits cmi5 sessionid extension when not in cmi5 mode', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const s = pub.buildStatement({ verb: { id: 'http://verb/a' } });
    expect(s.context?.extensions).toBeUndefined();
  });
  it('preserves caller-supplied context.extensions', async () => {
    const pub = new XAPIPublisher(basicOpts({ cmi5Mode: true }));
    await pub.init();
    const s = pub.buildStatement({
      verb: { id: 'http://verb/a' },
      context: { extensions: { 'http://my/ext': 'value' } },
    });
    expect(s.context?.extensions?.['http://my/ext']).toBe('value');
    expect(
      s.context?.extensions?.['https://w3id.org/xapi/cmi5/context/extensions/sessionid']
    ).toBeDefined();
  });
  it('throws when called before init resolves a function-form actor', () => {
    const pub = new XAPIPublisher(
      basicOpts({ actor: async () => ({ mbox: 'mailto:a@b.c' }) })
    );
    expect(() => pub.buildStatement({ verb: { id: 'http://verb/a' } })).toThrow(
      /init/
    );
  });
});

describe('XAPIPublisher — sendStatement validation', () => {
  it('rejects missing verb.id', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    await expect(
      pub.sendStatement({ verb: { id: '' } })
    ).rejects.toThrow(XAPIStatementError);
  });
  it('rejects missing object.id when object supplied', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    await expect(
      pub.sendStatement({
        verb: { id: 'http://verb/a' },
        object: { id: '' },
      })
    ).rejects.toThrow(XAPIStatementError);
  });
  it('rejects score.scaled out of range', async () => {
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    await expect(
      pub.sendStatement({
        verb: { id: 'http://verb/a' },
        result: { score: { scaled: 1.5 } },
      })
    ).rejects.toThrow(XAPIStatementError);
  });
  it('accepts score.scaled in [-1, 1]', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement({
      verb: { id: 'http://verb/a' },
      result: { score: { scaled: -0.5 } },
    });
    expect(r.destinations[0].ok).toBe(true);
  });
});

describe('XAPIPublisher — send + retry', () => {
  it('reports ok on 204', async () => {
    mockFetch.mockResolvedValue({ ok: true, status: 204 });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r.destinations[0]).toMatchObject({ ok: true, status: 204 });
  });

  it('treats 409 as success (idempotent replay)', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 409 });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r.destinations[0]).toMatchObject({ ok: true, status: 409 });
  });

  it('retries on 5xx and eventually succeeds', async () => {
    let n = 0;
    mockFetch.mockImplementation(async () => {
      n++;
      if (n < 3) return { ok: false, status: 503 };
      return { ok: true, status: 204 };
    });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(n).toBe(3);
    expect(r.destinations[0].ok).toBe(true);
  });

  it('short-circuits on 4xx (no retry)', async () => {
    let n = 0;
    mockFetch.mockImplementation(async () => {
      n++;
      return { ok: false, status: 400 };
    });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(n).toBe(1);
    expect(r.destinations[0]).toMatchObject({ ok: false, status: 400 });
  });

  it('per-statement retry: false sends once and reports outcome', async () => {
    let n = 0;
    mockFetch.mockImplementation(async () => {
      n++;
      return { ok: false, status: 503 };
    });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement(
      { verb: { id: 'http://verb/a' } },
      { retry: false }
    );
    expect(n).toBe(1);
    expect(r.destinations[0]).toMatchObject({ ok: false, status: 503 });
  });

  it('returns the fully-formed statement with actor + timestamp filled', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r.statement.actor).toEqual({
      mbox: 'mailto:test@example.com',
      objectType: 'Agent',
    });
    expect(r.statement.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(r.statement.id).toBe(r.statementId);
  });
});

describe('XAPIPublisher — auth header', () => {
  it('attaches Basic <token> Authorization header', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const pub = new XAPIPublisher(basicOpts({ auth: 'mytoken' }));
    await pub.init();
    await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.get('Authorization')).toBe('Basic mytoken');
    expect(headers.get('X-Experience-API-Version')).toBe('1.0.3');
  });

  it('omits Authorization header when auth is empty string', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const pub = new XAPIPublisher(basicOpts({ auth: '' }));
    await pub.init();
    await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.get('Authorization')).toBeNull();
  });
});

describe('XAPIPublisher — function-form auth and 401 handling', () => {
  it('resolves a function-form auth on first send', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const resolver = vi.fn().mockResolvedValue('resolved-tok');
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][1].headers.get('Authorization')).toBe(
      'Basic resolved-tok'
    );
  });

  it('caches the resolved token across sends', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const resolver = vi.fn().mockResolvedValue('tok-v1');
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    await pub.sendStatement({ verb: { id: 'http://verb/b' } });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('on 401 with function-form auth, re-resolves and retries the request once', async () => {
    let n = 0;
    mockFetch.mockImplementation(async () => {
      n++;
      if (n === 1) return { ok: false, status: 401 };
      return { ok: true, status: 204 };
    });
    const resolver = vi
      .fn()
      .mockResolvedValueOnce('stale-tok')
      .mockResolvedValueOnce('fresh-tok');
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(n).toBe(2);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(r.destinations[0].ok).toBe(true);
  });

  it('on two consecutive 401s, marks auth dead', async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 401 });
    const resolver = vi.fn().mockResolvedValue('tok');
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    const r1 = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r1.destinations[0]).toMatchObject({ ok: false, status: 401 });
    // Subsequent send should fail-fast without hitting fetch.
    mockFetch.mockClear();
    const r2 = await pub.sendStatement({ verb: { id: 'http://verb/b' } });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(r2.destinations[0].ok).toBe(false);
  });

  it('dead-flag persists for the publisher lifetime — subsequent sends never hit fetch', async () => {
    let n = 0;
    // First send: two 401s mark dead. Anything after must short-circuit
    // before fetch is touched — the test asserts that explicitly.
    mockFetch.mockImplementation(async () => {
      n++;
      return { ok: false, status: 401 };
    });
    const resolver = vi.fn().mockResolvedValue('tok');
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    const r1 = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(n).toBe(2); // initial + one re-resolve attempt
    expect(r1.destinations[0]).toMatchObject({ ok: false, status: 401 });

    // Pretend the LRS would accept us now — the publisher must not
    // discover that, because the dead-flag short-circuits before fetch.
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({ ok: true, status: 204 });

    const r2 = await pub.sendStatement({ verb: { id: 'http://verb/b' } });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(r2.destinations[0].ok).toBe(false);
    expect(r2.destinations[0].error?.message).toMatch(/twice in a row/);
    expect(r2.destinations[0].error?.message).toMatch(/Reload the runtime/);

    const r3 = await pub.sendStatement({ verb: { id: 'http://verb/c' } });
    expect(mockFetch).not.toHaveBeenCalled();
    expect(r3.destinations[0].ok).toBe(false);
  });

  it('rejects if the auth resolver throws', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const resolver = vi.fn().mockRejectedValue(new Error('network'));
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r.destinations[0].ok).toBe(false);
    expect(r.destinations[0].error?.message).toMatch(/auth resolver/);
  });

  it('rejects if the auth resolver returns the "Basic " prefix', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const resolver = vi.fn().mockResolvedValue('Basic tok');
    const pub = new XAPIPublisher(basicOpts({ auth: resolver }));
    await pub.init();
    const r = await pub.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r.destinations[0].ok).toBe(false);
  });
});

describe('XAPIPublisher — function-form actor', () => {
  it('resolves an actor function during init', async () => {
    const resolver = vi.fn().mockResolvedValue({ mbox: 'mailto:resolved@e.c' });
    const pub = new XAPIPublisher(basicOpts({ actor: resolver }));
    await pub.init();
    expect(pub.getActor()).toEqual({ mbox: 'mailto:resolved@e.c' });
    expect(resolver).toHaveBeenCalledTimes(1);
  });

  it('throws if the resolved actor fails the Identified Agent rule', async () => {
    const pub = new XAPIPublisher(basicOpts({ actor: () => ({ name: 'no-ifi' } as any) }));
    await expect(pub.init()).rejects.toThrow(XAPIConfigError);
  });

  it('throws if the resolver throws', async () => {
    const pub = new XAPIPublisher(
      basicOpts({ actor: () => Promise.reject(new Error('noauth')) })
    );
    await expect(pub.init()).rejects.toThrow(/actor resolver/);
  });
});

describe('XAPIPublisher — queue ordering', () => {
  it('sends statements in FIFO order even when later sends are slower', async () => {
    const order: string[] = [];
    mockFetch.mockImplementation(async (_url, opts) => {
      const body = JSON.parse(opts.body);
      const verb = body.verb.id;
      order.push(verb);
      return { ok: true };
    });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    pub.sendStatement({ verb: { id: 'http://verb/1' } });
    pub.sendStatement({ verb: { id: 'http://verb/2' } });
    pub.sendStatement({ verb: { id: 'http://verb/3' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['http://verb/1', 'http://verb/2', 'http://verb/3']);
  });
});

describe('XAPIPublisher — chainTask + markUnloading', () => {
  it('chainTask preserves order with statement sends', async () => {
    const order: string[] = [];
    mockFetch.mockImplementation(async () => {
      order.push('send');
      return { ok: true };
    });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    pub.sendStatement({ verb: { id: 'http://verb/1' } });
    pub.chainTask(async () => {
      order.push('task');
    });
    pub.sendStatement({ verb: { id: 'http://verb/2' } });
    await new Promise((r) => setTimeout(r, 50));
    expect(order).toEqual(['send', 'task', 'send']);
  });

  it('markUnloading flips keepalive on subsequent sends', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const pub = new XAPIPublisher(basicOpts());
    await pub.init();
    pub.markUnloading();
    await pub.sendStatement({ verb: { id: 'http://verb/x' } });
    expect(mockFetch.mock.calls[0][1].keepalive).toBe(true);
  });
});

describe('XAPIClient — fan-out', () => {
  function makePub(endpoint: string, actor: XAPIAgent = { mbox: 'mailto:a@b.c' }) {
    return new XAPIPublisher({
      endpoint,
      auth: 'tok',
      actor,
      activityId: 'https://example.com/c',
    });
  }

  it('fans out one statement to every destination with a shared id', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const p1 = makePub('https://lrs1.example.com/xapi/');
    const p2 = makePub('https://lrs2.example.com/xapi/');
    await p1.init();
    await p2.init();
    const client = new XAPIClient([p1, p2]);
    const r = await client.sendStatement({ verb: { id: 'http://verb/a' } });
    expect(r.destinations).toHaveLength(2);
    expect(r.destinations.map((d) => d.endpoint).sort()).toEqual([
      'https://lrs1.example.com/xapi/',
      'https://lrs2.example.com/xapi/',
    ]);
    // Two POSTs, both with the same statement id.
    const ids = mockFetch.mock.calls.map((c) => JSON.parse(c[1].body).id);
    expect(new Set(ids).size).toBe(1);
    expect(r.statementId).toBe(ids[0]);
  });

  it('isolates failures — one destination 5xx does not affect another', async () => {
    mockFetch.mockImplementation(async (url) => {
      if (String(url).startsWith('https://lrs1.')) return { ok: false, status: 503 };
      return { ok: true, status: 204 };
    });
    const p1 = makePub('https://lrs1.example.com/xapi/');
    const p2 = makePub('https://lrs2.example.com/xapi/');
    await p1.init();
    await p2.init();
    const client = new XAPIClient([p1, p2]);
    const r = await client.sendStatement(
      { verb: { id: 'http://verb/a' } },
      { retry: false }
    );
    const o1 = r.destinations.find((d) => d.endpoint.includes('lrs1'));
    const o2 = r.destinations.find((d) => d.endpoint.includes('lrs2'));
    expect(o1?.ok).toBe(false);
    expect(o2?.ok).toBe(true);
  });

  it('returns the first publisher\'s actor / activityId / sessionId', async () => {
    const p1 = new XAPIPublisher({
      endpoint: 'https://lrs1.example.com/xapi/',
      auth: 't',
      actor: { mbox: 'mailto:primary@e.c' },
      activityId: 'https://example.com/primary',
      sessionId: 'sess-primary',
    });
    const p2 = new XAPIPublisher({
      endpoint: 'https://lrs2.example.com/xapi/',
      auth: 't',
      actor: { mbox: 'mailto:secondary@e.c' },
      activityId: 'https://example.com/secondary',
      sessionId: 'sess-secondary',
    });
    await p1.init();
    await p2.init();
    const client = new XAPIClient([p1, p2]);
    expect(client.getActor()).toEqual({ mbox: 'mailto:primary@e.c' });
    expect(client.getActivityId()).toBe('https://example.com/primary');
    expect(client.getSessionId()).toBe('sess-primary');
  });

  it('rejects validation failures synchronously before any HTTP traffic', async () => {
    const p1 = makePub('https://lrs1.example.com/xapi/');
    await p1.init();
    const client = new XAPIClient([p1]);
    await expect(
      client.sendStatement({ verb: { id: '' } })
    ).rejects.toThrow(XAPIStatementError);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('rejects sendStatement after markUnloading when all publishers are cmi5-mode (Terminated must stay last)', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const p1 = new XAPIPublisher({
      endpoint: 'https://lrs1.example.com/xapi/',
      auth: 'tok',
      actor: { mbox: 'mailto:a@b.c' },
      activityId: 'https://example.com/c',
      cmi5Mode: true,
    });
    const p2 = new XAPIPublisher({
      endpoint: 'https://lrs2.example.com/xapi/',
      auth: 'tok',
      actor: { mbox: 'mailto:a@b.c' },
      activityId: 'https://example.com/c',
      cmi5Mode: true,
    });
    await p1.init();
    await p2.init();
    const client = new XAPIClient([p1, p2]);
    client.markUnloading();
    expect(p1.isUnloading()).toBe(true);
    expect(p2.isUnloading()).toBe(true);
    await expect(
      client.sendStatement({ verb: { id: 'http://verb/late' } })
    ).rejects.toThrow(/unloading/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('after markUnloading still sends to independent (non-cmi5) destinations; only cmi5 destinations are dropped', async () => {
    mockFetch.mockResolvedValue({ ok: true });
    const cmi5Pub = new XAPIPublisher({
      endpoint: 'https://cmi5.example.com/xapi/',
      auth: 'tok',
      actor: { mbox: 'mailto:a@b.c' },
      activityId: 'https://example.com/c',
      cmi5Mode: true,
    });
    const independentPub = makePub('https://analytics.example.com/xapi/');
    await cmi5Pub.init();
    await independentPub.init();
    const client = new XAPIClient([cmi5Pub, independentPub]);
    client.markUnloading();
    const r = await client.sendStatement({ verb: { id: 'http://verb/late' } });
    const cmi5Outcome = r.destinations.find((d) => d.endpoint.includes('cmi5'));
    const indepOutcome = r.destinations.find((d) => d.endpoint.includes('analytics'));
    expect(cmi5Outcome?.ok).toBe(false);
    expect(cmi5Outcome?.error?.message).toMatch(/unloading|cmi5/i);
    expect(indepOutcome?.ok).toBe(true);
  });
});

describe('useXAPI registry', () => {
  it('returns null when no publisher is registered', async () => {
    const { useXAPI, registerXAPIClient } = await import(
      '../src/runtime/xapi/registry.js'
    );
    registerXAPIClient(null);
    expect(useXAPI()).toBeNull();
  });

  it('returns the registered client', async () => {
    const { useXAPI, registerXAPIClient } = await import(
      '../src/runtime/xapi/registry.js'
    );
    const p = new XAPIPublisher(basicOpts());
    await p.init();
    const client = new XAPIClient([p]);
    registerXAPIClient(client);
    expect(useXAPI()).toBe(client);
    registerXAPIClient(null); // reset
  });
});

describe('derive-actor helpers', () => {
  it('synthesizeSCORM12Actor returns a well-formed Identified Agent', async () => {
    const { synthesizeSCORM12Actor } = await import(
      '../src/runtime/xapi/derive-actor.js'
    );
    const api: any = {
      LMSGetValue: (k: string) =>
        k === 'cmi.core.student_id' ? 'student-42' :
        k === 'cmi.core.student_name' ? 'Ada Lovelace' : '',
    };
    const a = synthesizeSCORM12Actor(api, 'https://example.com/courses/1');
    expect(a).toEqual({
      account: { homePage: 'https://example.com', name: 'student-42' },
      name: 'Ada Lovelace',
      objectType: 'Agent',
    });
    expect(validateAgent(a)).toBeNull();
  });

  it('synthesizeSCORM12Actor honors actorAccountHomePage override', async () => {
    const { synthesizeSCORM12Actor } = await import(
      '../src/runtime/xapi/derive-actor.js'
    );
    const api: any = {
      LMSGetValue: (k: string) => (k === 'cmi.core.student_id' ? 'sid' : ''),
    };
    const a = synthesizeSCORM12Actor(
      api,
      'https://example.com/courses/1',
      'https://lms.example.com'
    );
    expect(a?.account?.homePage).toBe('https://lms.example.com');
  });

  it('synthesizeSCORM12Actor returns null when student_id is missing', async () => {
    const { synthesizeSCORM12Actor } = await import(
      '../src/runtime/xapi/derive-actor.js'
    );
    const api: any = { LMSGetValue: () => '' };
    expect(
      synthesizeSCORM12Actor(api, 'https://example.com/courses/1')
    ).toBeNull();
  });

  it('synthesizeSCORM2004Actor reads cmi.learner_id / cmi.learner_name', async () => {
    const { synthesizeSCORM2004Actor } = await import(
      '../src/runtime/xapi/derive-actor.js'
    );
    const api: any = {
      GetValue: (k: string) =>
        k === 'cmi.learner_id' ? 'learner-7' :
        k === 'cmi.learner_name' ? 'Grace Hopper' : '',
    };
    const a = synthesizeSCORM2004Actor(api, 'https://example.com/courses/1');
    expect(a).toEqual({
      account: { homePage: 'https://example.com', name: 'learner-7' },
      name: 'Grace Hopper',
      objectType: 'Agent',
    });
  });
});
