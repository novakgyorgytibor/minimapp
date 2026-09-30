import { config } from '../config';
import { haversineM } from '../nav/geo';
import type { LngLat, Mode } from '../types';
import { fetchJson, type FetchDeps } from './http';

const TRAIL_MIN_STEP_M = 10;
const TRAIL_MAX = 6;
const QUERY_EVERY_MS = 10_000;
const QUERY_EVERY_M = 150;
const ROLLING_MPS = 5 / 3.6;

interface TraceAttributesResponse {
  edges?: { speed_limit?: number }[];
}

/**
 * Aktuális sebességkorlát (km/h) az OSM-ből: a friss GPS-nyomvonalat a Valhalla trace_attributes
 * az úthálózatra illeszti, és az utolsó útszakasz korlátját adjuk vissza. Ismeretlen → null.
 */
export async function getSpeedLimit(trail: LngLat[], signal?: AbortSignal, deps?: FetchDeps): Promise<number | null> {
  if (trail.length < 2) return null;
  const body = {
    shape: trail.map(([lon, lat]) => ({ lat, lon })),
    costing: 'auto',
    shape_match: 'map_snap',
    filters: { attributes: ['edge.speed_limit'], action: 'include' },
  };
  const res = await fetchJson<TraceAttributesResponse>(
    config.valhallaTraceUrl,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': config.userAgent },
      body: JSON.stringify(body),
      signal,
    },
    deps,
  );
  const limit = res.edges?.[res.edges.length - 1]?.speed_limit;
  return limit && limit > 0 ? limit : null;
}

/** A nyomvonal utolsó (legalább 10 m-es lépésekkel felvett, legfeljebb 6) pontja; változatlan → ugyanaz a tömb. */
export function pushTrail(trail: LngLat[], pos: LngLat): LngLat[] {
  const last = trail[trail.length - 1];
  if (last && haversineM(last, pos) < TRAIL_MIN_STEP_M) return trail;
  return [...trail, pos].slice(-TRAIL_MAX);
}

/** Újabb lekérdezés legfeljebb 10 s-onként, vagy 150 m haladás után. */
export function shouldQuerySpeedLimit(last: { at: number; pos: LngLat } | null, pos: LngLat, now: number): boolean {
  if (!last) return true;
  return now - last.at >= QUERY_EVERY_MS || haversineM(last.pos, pos) >= QUERY_EVERY_M;
}

/** Autós módban: navigáció közben, vagy útvonal nélkül is, ha 5 km/h felett haladunk. */
export function speedLimitVisible({ mode, navigating, speedMps }: { mode: Mode; navigating: boolean; speedMps: number | null }): boolean {
  if (mode !== 'auto') return false;
  return navigating || (speedMps !== null && speedMps > ROLLING_MPS);
}
