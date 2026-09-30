import { config } from '../config';
import type { Lang } from '../i18n/strings';
import type { LngLat, Place } from '../types';
import { fetchJson, isAbortError, type FetchDeps } from './http';

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
const photonThrottle = createRateLimiter(config.photonMinIntervalMs);

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

export async function searchNominatim(
  query: string,
  near: LngLat | null,
  signal?: AbortSignal,
  deps: FetchDeps & { throttle?: () => Promise<void> } = {},
  lang: Lang = 'en',
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < config.searchMinChars) return [];
  const params = new URLSearchParams({ q, format: 'jsonv2', limit: '6', 'accept-language': lang });
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

interface PhotonProps {
  name?: string;
  street?: string;
  housenumber?: string;
  district?: string;
  city?: string;
  locality?: string;
}

interface PhotonResponse {
  features?: { properties: PhotonProps; geometry: { coordinates: [number, number] } }[];
}

function photonPlace(p: PhotonProps, coord: [number, number]): Place {
  const street = [p.street, p.housenumber].filter(Boolean).join(' ');
  const area = [p.district ?? p.locality, p.city].filter(Boolean).join(', ');
  if (p.name) return { name: p.name, detail: [street, area].filter(Boolean).join(', '), coord };
  return { name: street || area, detail: street ? area : '', coord };
}

/** Photon (komoot, OSM-alapú): gépelés közben, szótöredékre is talál; intézmények, üzletek, címek. */
export async function searchPhoton(
  query: string,
  near: LngLat | null,
  signal?: AbortSignal,
  deps: FetchDeps & { throttle?: () => Promise<void> } = {},
  lang: Lang = 'en',
): Promise<Place[]> {
  const q = query.trim();
  if (q.length < config.searchMinChars) return [];
  const params = new URLSearchParams({ q, limit: '6' });
  if (near) {
    params.set('lat', String(near[1]));
    params.set('lon', String(near[0]));
  }
  // Magyarul nincs lang: a Photon ekkor az eredeti (helyi, magyar) neveket adja
  if (lang === 'en') params.set('lang', 'en');
  await (deps.throttle ?? photonThrottle)();
  const res = await fetchJson<PhotonResponse>(
    `${config.photonUrl}?${params.toString()}`,
    { headers: { 'User-Agent': config.userAgent, Accept: 'application/json' }, signal },
    deps,
  );
  return (res.features ?? []).map((f) => photonPlace(f.properties, f.geometry.coordinates));
}

/** Előbb Photon; ha nincs találat vagy hibát ad, Nominatim. */
export async function searchPlaces(
  query: string,
  near: LngLat | null,
  signal?: AbortSignal,
  deps: FetchDeps & { throttle?: () => Promise<void> } = {},
  lang: Lang = 'en',
): Promise<Place[]> {
  if (query.trim().length < config.searchMinChars) return [];
  try {
    const places = await searchPhoton(query, near, signal, deps, lang);
    if (places.length > 0) return places;
  } catch (e) {
    if (isAbortError(e)) throw e;
  }
  return searchNominatim(query, near, signal, deps, lang);
}
