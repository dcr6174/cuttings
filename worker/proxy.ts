/**
 * Cuttings Jev proxy (Cloudflare Worker).
 *
 * The browser app cannot call the TypeSafe API directly: the API key must stay
 * server-side and the API does not allow browser CORS calls from GitHub Pages.
 * This Worker is a narrow gate in front of POST /v1/systemone:
 *
 * - Only the exact GitHub Pages origin may call it.
 * - Only POST /v1/systemone is served.
 * - Bodies are capped at 16 KB.
 * - The model is fixed to jev-latest; callers cannot choose one.
 * - 1-4 boolean (noul) questions per call, with field and state size caps.
 * - Unexpected top-level fields are rejected.
 * - The TypeSafe key lives only in the encrypted secret TYPESAFE_JEV_KEY.
 */

export interface ProxyEnv {
  TYPESAFE_JEV_KEY?: string;
  JEV_RATE_LIMITER?: {
    limit(options: { key: string }): Promise<{ success: boolean }>;
  };
}

const ALLOWED_ORIGIN = 'https://dcr6174.github.io';
const UPSTREAM_URL = 'https://api.typesafe.ai/v1/systemone';
const MODEL = 'jev-latest';

const MAX_BODY_BYTES = 16 * 1024;
const MAX_QUESTIONS = 4;
const MAX_QUESTION_ID_CHARS = 64;
const MAX_INSTRUCTIONS_CHARS = 1000;
const MAX_CRITERIA_CHARS = 1000;
const MAX_STATE_ENTRIES = 8;
const MAX_STATE_KEY_CHARS = 64;
const MAX_STATE_VALUE_CHARS = 4000;
const UPSTREAM_TIMEOUT_MS = 15_000;

function corsHeaders(origin: string): Record<string, string> {
  return origin === ALLOWED_ORIGIN
    ? { 'access-control-allow-origin': ALLOWED_ORIGIN, vary: 'Origin' }
    : {};
}

function responseHeaders(origin: string): Record<string, string> {
  return {
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...corsHeaders(origin),
  };
}

function json(status: number, body: unknown, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...responseHeaders(origin) },
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unexpectedField(allowed: readonly string[], container: Record<string, unknown>): string | null {
  for (const key of Object.keys(container)) {
    if (!allowed.includes(key)) return key;
  }
  return null;
}

type CleanQuestion = { type: 'noul'; instructions: string; criteria?: { true?: string; false?: string } };
type CleanState = string | Record<string, string>;

function cleanQuestions(raw: unknown): { ok: true; questions: Record<string, CleanQuestion> } | { ok: false; error: string } {
  if (!isPlainObject(raw)) return { ok: false, error: 'questions must be an object.' };
  const ids = Object.keys(raw);
  if (ids.length === 0) return { ok: false, error: 'questions must contain at least 1 question.' };
  if (ids.length > MAX_QUESTIONS) return { ok: false, error: `questions is capped at ${MAX_QUESTIONS} per call.` };
  const questions: Record<string, CleanQuestion> = {};
  for (const id of ids) {
    if (id.length > MAX_QUESTION_ID_CHARS) return { ok: false, error: `question id "${id.slice(0, 20)}…" is over ${MAX_QUESTION_ID_CHARS} characters.` };
    const value = raw[id];
    if (!isPlainObject(value)) return { ok: false, error: `question "${id}" must be an object.` };
    const extra = unexpectedField(['type', 'instructions', 'criteria'], value);
    if (extra) return { ok: false, error: `question "${id}" has unexpected field "${extra}".` };
    if (value.type !== 'noul') return { ok: false, error: `question "${id}" must be type "noul" (a yes/no question).` };
    if (typeof value.instructions !== 'string' || value.instructions.trim() === '') {
      return { ok: false, error: `question "${id}" needs instructions.` };
    }
    if (value.instructions.length > MAX_INSTRUCTIONS_CHARS) {
      return { ok: false, error: `question "${id}" instructions are over ${MAX_INSTRUCTIONS_CHARS} characters.` };
    }
    const question: CleanQuestion = { type: 'noul', instructions: value.instructions };
    if (value.criteria !== undefined) {
      if (!isPlainObject(value.criteria)) return { ok: false, error: `question "${id}" criteria must be an object.` };
      const criteriaExtra = unexpectedField(['true', 'false'], value.criteria);
      if (criteriaExtra) return { ok: false, error: `question "${id}" criteria has unexpected field "${criteriaExtra}".` };
      const criteria: { true?: string; false?: string } = {};
      for (const side of ['true', 'false'] as const) {
        const description = value.criteria[side];
        if (description === undefined) continue;
        if (typeof description !== 'string') return { ok: false, error: `question "${id}" criteria.${side} must be a string.` };
        if (description.length > MAX_CRITERIA_CHARS) {
          return { ok: false, error: `question "${id}" criteria.${side} is over ${MAX_CRITERIA_CHARS} characters.` };
        }
        criteria[side] = description;
      }
      question.criteria = criteria;
    }
    questions[id] = question;
  }
  return { ok: true, questions };
}

function cleanState(raw: unknown): { ok: true; state: CleanState } | { ok: false; error: string } {
  if (typeof raw === 'string') {
    return raw.length <= MAX_STATE_VALUE_CHARS
      ? { ok: true, state: raw }
      : { ok: false, error: `state is over ${MAX_STATE_VALUE_CHARS} characters.` };
  }
  if (!isPlainObject(raw)) return { ok: false, error: 'state must be a string or an object of short string fields.' };
  const entries = Object.entries(raw);
  if (entries.length > MAX_STATE_ENTRIES) return { ok: false, error: `state is capped at ${MAX_STATE_ENTRIES} fields.` };
  const state: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (key.length > MAX_STATE_KEY_CHARS) return { ok: false, error: `state field "${key.slice(0, 20)}…" is over ${MAX_STATE_KEY_CHARS} characters.` };
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return { ok: false, error: `state field "${key}" must be a short string.` };
    }
    const text = String(value);
    if (text.length > MAX_STATE_VALUE_CHARS) return { ok: false, error: `state field "${key}" is over ${MAX_STATE_VALUE_CHARS} characters.` };
    state[key] = text;
  }
  return { ok: true, state };
}

export async function handleFetch(request: Request, env: ProxyEnv): Promise<Response> {
  const origin = request.headers.get('origin') ?? '';
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    if (origin !== ALLOWED_ORIGIN) return json(403, { error: 'Origin is not allowed.' }, origin);
    return new Response(null, {
      status: 204,
      headers: {
        ...corsHeaders(origin),
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '86400',
      },
    });
  }

  if (url.pathname !== '/v1/systemone') return json(404, { error: 'Not found.' }, origin);
  if (request.method !== 'POST') return json(405, { error: 'Only POST is allowed.' }, origin);
  if (origin !== ALLOWED_ORIGIN) return json(403, { error: 'Origin is not allowed.' }, origin);

  // CORS is a browser boundary, not authentication. The rate-limit binding is
  // the actual cost-control boundary for scripted clients that can forge Origin.
  // Fail closed in production if the binding has not been configured.
  if (!env.JEV_RATE_LIMITER) return json(503, { error: 'The proxy rate limiter is not configured.' }, origin);
  const clientAddress = request.headers.get('cf-connecting-ip') ?? 'unknown';
  const allowance = await env.JEV_RATE_LIMITER.limit({ key: clientAddress });
  if (!allowance.success) {
    return new Response(JSON.stringify({ error: 'Too many requests. Try again shortly.' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'retry-after': '60', ...responseHeaders(origin) },
    });
  }

  const declared = Number(request.headers.get('content-length') ?? '0');
  if (declared > MAX_BODY_BYTES) return json(413, { error: 'Body is over the 16 KB cap.' }, origin);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return json(413, { error: 'Body is over the 16 KB cap.' }, origin);

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return json(400, { error: 'Body must be valid JSON.' }, origin);
  }
  if (!isPlainObject(body)) return json(400, { error: 'Body must be a JSON object.' }, origin);
  const extra = unexpectedField(['state', 'questions', 'model'], body);
  if (extra) return json(400, { error: `Unexpected top-level field "${extra}".` }, origin);

  const state = cleanState(body.state);
  if (!state.ok) return json(400, { error: state.error }, origin);
  const questions = cleanQuestions(body.questions);
  if (!questions.ok) return json(400, { error: questions.error }, origin);

  if (!env.TYPESAFE_JEV_KEY) return json(500, { error: 'The proxy has no API key configured.' }, origin);

  const outbound = { state: state.state, model: MODEL, questions: questions.questions };
  let upstream: Response;
  try {
    upstream = await fetch(UPSTREAM_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.TYPESAFE_JEV_KEY}` },
      body: JSON.stringify(outbound),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return json(502, { error: 'The TypeSafe API could not be reached.' }, origin);
  }
  const result = await upstream.text();
  return new Response(result, {
    status: upstream.status,
    headers: { 'content-type': 'application/json', ...responseHeaders(origin) },
  });
}

export default { fetch: handleFetch };
