import { config } from '../config';

export type HttpErrorKind = 'network' | 'rate-limited' | 'http';

export class HttpError extends Error {
  constructor(public kind: HttpErrorKind, public status = 0, message: string = kind) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  retries?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

async function fetchOnce(
  url: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const external = init.signal ?? undefined;
  let timedOut = false;
  const onAbort = () => ctrl.abort();
  if (external) {
    if (external.aborted) ctrl.abort();
    else external.addEventListener('abort', onAbort);
  }
  const timer = setTimeout(() => {
    timedOut = true;
    ctrl.abort();
  }, timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (isAbortError(e) && !timedOut) throw e;
    throw new HttpError('network', 0, timedOut ? 'timeout' : String(e));
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

export async function fetchJson<T>(url: string, init: RequestInit, deps: FetchDeps = {}): Promise<T> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const sleep = deps.sleep ?? defaultSleep;
  const timeoutMs = deps.timeoutMs ?? config.httpTimeoutMs;
  const retries = deps.retries ?? config.httpRetries;

  for (let attempt = 0; ; attempt++) {
    const res = await fetchOnce(url, init, fetchImpl, timeoutMs);
    if (res.status === 429) {
      if (attempt >= retries) throw new HttpError('rate-limited', 429);
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    if (!res.ok) throw new HttpError('http', res.status, await res.text().catch(() => ''));
    return (await res.json()) as T;
  }
}
