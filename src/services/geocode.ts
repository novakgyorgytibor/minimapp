import { config } from '../config';
import type { LngLat, Place } from '../types';
import { fetchJson, type FetchDeps } from './http';

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createRateLimiter(
  minIntervalMs: number,
  now: () => number = Date.now,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): () => Promise<void> {
  let nextAllowedAt = -Infinity;
  return async () => {
    const t = now();
    const slot = Math.max(t, nextAllowedAt);
    nextAllowedAt = slot + minIntervalMs;
    if (slot > t) await sleep(slot - t);
  };
}

const nominatimThrottle = createRateLimiter(config.nominatimMinIntervalMs);

interface NominatimResult {
  lat: string;
  lon: string;
  name?: string;
  display_name: string;
}

function toPlace(r: NominatimResult): Place {
  const parts = r.display_name.split(', ');
  const name = r.name && r.name.length > 0 ? r.name : parts[0];
  const rest = parts[0] === name ? parts.slice(1) : parts;
  return {
    name,
    detail: rest.slice(0, 3).join(', '),
    coord: [Number(r.lon), Number(r.lat)],
  };
}

export async function searchPlaces(
  query: string,
  near: LngLat | null,
  signal?: AbortSignal,
  deps: FetchDeps & { throttle?: () => Promise<void> } = {},
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < config.searchMinChars) return [];
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '6', 'accept-language': 'en' });
  if (near) {
    const [lng, lat] = near;
    params.set('viewbox', [lng - 0.5, lat + 0.5, lng + 0.5, lat - 0.5].join(','));
  }
  await (deps.throttle ?? nominatimThrottle)();
  const results = await fetchJson<NominatimResult[]>(
    `${config.nominatimUrl}?${params.toString()}`,
    { headers: { 'User-Agent': config.userAgent, Accept: 'application/json' }, signal },
    deps,
  );
  return results.map(toPlace);
}
