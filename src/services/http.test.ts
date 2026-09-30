import { fetchJson, HttpError, isAbortError } from './http';

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }) as Response;
const status = (s: number) =>
  ({ ok: false, status: s, json: async () => ({}), text: async () => `status ${s}` }) as Response;

test('returns parsed JSON', async () => {
  const fetchImpl = jest.fn(async () => ok({ a: 1 }));
  await expect(fetchJson('u', {}, { fetchImpl })).resolves.toEqual({ a: 1 });
});

test('retries 429 with 1s, 2s, 4s backoff then succeeds', async () => {
  const responses = [status(429), status(429), status(429), ok({ done: true })];
  const fetchImpl = jest.fn(async () => responses.shift()!);
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); };
  await expect(fetchJson('u', {}, { fetchImpl, sleep, retries: 3 })).resolves.toEqual({ done: true });
  expect(sleeps).toEqual([1000, 2000, 4000]);
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test('gives up after retries with rate-limited', async () => {
  const fetchImpl = jest.fn(async () => status(429));
  const err = await fetchJson('u', {}, { fetchImpl, sleep: async () => {}, retries: 3 }).catch((e: HttpError) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect(err.kind).toBe('rate-limited');
  expect(fetchImpl).toHaveBeenCalledTimes(4);
});

test('non-ok status becomes http error with status', async () => {
  const fetchImpl = jest.fn(async () => status(400));
  const err = await fetchJson('u', {}, { fetchImpl }).catch((e: HttpError) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect(err.kind).toBe('http');
  expect(err.status).toBe(400);
});

test('fetch rejection becomes network error', async () => {
  const fetchImpl = jest.fn(async () => { throw new TypeError('Network request failed'); });
  const err = await fetchJson('u', {}, { fetchImpl }).catch((e: HttpError) => e);
  expect(err.kind).toBe('network');
});

const hanging: typeof fetch = (_url, init) =>
  new Promise((_, reject) => {
    init?.signal?.addEventListener('abort', () => {
      const e = new Error('Aborted');
      e.name = 'AbortError';
      reject(e);
    });
  });

test('timeout becomes network error', async () => {
  const err = await fetchJson('u', {}, { fetchImpl: hanging, timeoutMs: 20 }).catch((e: HttpError) => e);
  expect(err).toBeInstanceOf(HttpError);
  expect(err.kind).toBe('network');
});

test('external abort is rethrown as AbortError, not HttpError', async () => {
  const ctrl = new AbortController();
  const p = fetchJson('u', { signal: ctrl.signal }, { fetchImpl: hanging, timeoutMs: 10_000 });
  ctrl.abort();
  const err = await p.catch((e: HttpError) => e);
  expect(isAbortError(err)).toBe(true);
  expect(err).not.toBeInstanceOf(HttpError);
});
