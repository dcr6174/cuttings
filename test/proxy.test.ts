import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleFetch } from '../worker/proxy.js';

const ORIGIN = 'https://dcr6174.github.io';
const ENV = { TYPESAFE_JEV_KEY: 'test-key' };

function request(body: unknown, init: { origin?: string | null; method?: string; path?: string; contentLength?: string } = {}): Request {
  const url = `https://cuttings-jev-proxy.dcr6174.workers.dev${init.path ?? '/v1/systemone'}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.contentLength) headers['content-length'] = init.contentLength;
  const method = init.method ?? 'POST';
  const payload = method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined;
  return new Request(url, { method, headers, ...(payload === undefined ? {} : { body: payload }) });
}

const validBody = {
  state: { title: 'Flat with balcony', source: 'fixture', url: 'https://example.test/1', text: 'Sunny balcony.' },
  model: 'jev-latest',
  questions: { c0: { type: 'noul', instructions: 'Does this have a balcony?', criteria: { true: 'Balcony mentioned', false: 'No balcony' } } },
};

function stubUpstream(status = 200, body: unknown = { model: 'jev-latest', answers: { c0: { type: 'noul', noul: 0.91 } } }) {
  const calls: { url: string; authorization: string; body: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { headers?: Record<string, string>; body?: string }) => {
    calls.push({ url: String(input), authorization: init?.headers?.authorization ?? '', body: init?.body ?? '' });
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }));
  return calls;
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('Jev proxy', () => {
  it('answers a CORS preflight from the allowed origin', async () => {
    const response = await handleFetch(request(null, { method: 'OPTIONS' }), ENV);
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(response.headers.get('access-control-allow-methods')).toContain('POST');
  });
  it('rejects a preflight from another origin', async () => {
    const response = await handleFetch(request(null, { method: 'OPTIONS', origin: 'https://evil.example' }), ENV);
    expect(response.status).toBe(403);
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });
  it('rejects a POST from another origin before reading the body', async () => {
    const response = await handleFetch(request(validBody, { origin: 'https://evil.example' }), ENV);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Origin is not allowed.' });
  });
  it('rejects a POST with no origin header', async () => {
    const response = await handleFetch(request(validBody, { origin: null }), ENV);
    expect(response.status).toBe(403);
  });
  it('only serves /v1/systemone', async () => {
    const response = await handleFetch(request(validBody, { path: '/v1/other' }), ENV);
    expect(response.status).toBe(404);
  });
  it('only allows POST', async () => {
    const response = await handleFetch(request(null, { method: 'GET' }), ENV);
    expect(response.status).toBe(405);
  });
  it('rejects a declared body over 16 KB', async () => {
    const response = await handleFetch(request(validBody, { contentLength: String(17 * 1024) }), ENV);
    expect(response.status).toBe(413);
  });
  it('rejects an actual body over 16 KB', async () => {
    const big = { ...validBody, state: 'x'.repeat(17 * 1024) };
    const response = await handleFetch(request(big), ENV);
    expect(response.status).toBe(413);
  });
  it('rejects invalid JSON', async () => {
    const response = await handleFetch(request('{not json'), ENV);
    expect(response.status).toBe(400);
  });
  it('rejects unexpected top-level fields', async () => {
    const response = await handleFetch(request({ ...validBody, admin: true }), ENV);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('admin');
  });
  it('rejects more than 4 questions', async () => {
    const questions = Object.fromEntries(['a', 'b', 'c', 'd', 'e'].map(id => [id, { type: 'noul', instructions: 'Is this about flats?' }]));
    const response = await handleFetch(request({ ...validBody, questions }), ENV);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('capped at 4');
  });
  it('rejects zero questions', async () => {
    const response = await handleFetch(request({ ...validBody, questions: {} }), ENV);
    expect(response.status).toBe(400);
  });
  it('rejects non-boolean question types', async () => {
    const questions = { c0: { type: 'choice', instructions: 'Pick one', criteria: { a: 'A', b: 'B' } } };
    const response = await handleFetch(request({ ...validBody, questions }), ENV);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toContain('noul');
  });
  it('rejects oversized instructions and state values', async () => {
    const longInstructions = await handleFetch(request({ ...validBody, questions: { c0: { type: 'noul', instructions: 'x'.repeat(1001) } } }), ENV);
    expect(longInstructions.status).toBe(400);
    const longState = await handleFetch(request({ ...validBody, state: { title: 'x'.repeat(4001) } }), ENV);
    expect(longState.status).toBe(400);
  });
  it('forwards a cleaned request upstream with the secret key and fixed model', async () => {
    const calls = stubUpstream();
    const sneaky = { ...validBody, model: 'some-other-model' };
    const response = await handleFetch(request(sneaky), ENV);
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(calls[0]!.authorization).toBe('Bearer test-key');
    const outbound = JSON.parse(calls[0]!.body);
    expect(outbound.model).toBe('jev-latest');
    expect(outbound.questions.c0).toEqual({ type: 'noul', instructions: 'Does this have a balcony?', criteria: { true: 'Balcony mentioned', false: 'No balcony' } });
    const body = await response.json();
    expect(body.answers.c0.noul).toBe(0.91);
  });
  it('passes through upstream error status', async () => {
    stubUpstream(401, { error: 'bad key' });
    const response = await handleFetch(request(validBody), ENV);
    expect(response.status).toBe(401);
  });
  it('fails closed when the secret is not configured', async () => {
    const response = await handleFetch(request(validBody), {});
    expect(response.status).toBe(500);
    expect((await response.json()).error).toContain('no API key');
  });
});
