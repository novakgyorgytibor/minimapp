import { config } from '../config';
import { VALHALLA_LANGUAGE, type Lang } from '../i18n/strings';
import { haversineM } from '../nav/geo';
import type { LngLat, Mode, Route, RoutePref, Step } from '../types';
import { fetchJson, HttpError, isAbortError, type FetchDeps } from './http';

export type RouteErrorKind = 'network' | 'rate-limited' | 'no-route' | 'no-position';

export class RouteError extends Error {
  constructor(public kind: RouteErrorKind) {
    super(kind);
    this.name = 'RouteError';
  }
}

export function decodePolyline(str: string, precision = 6): LngLat[] {
  const factor = 10 ** precision;
  const out: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < str.length) {
    lat += next();
    lng += next();
    out.push([lng / factor, lat / factor]);
  }
  return out;
}

export function buildRoute(coords: LngLat[], durationS: number, rawSteps: Omit<Step, 'beginDistM'>[]): Route {
  const cumDistM = [0];
  for (let i = 1; i < coords.length; i++) cumDistM.push(cumDistM[i - 1] + haversineM(coords[i - 1], coords[i]));
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  for (const [x, y] of coords) {
    w = Math.min(w, x); e = Math.max(e, x);
    s = Math.min(s, y); n = Math.max(n, y);
  }
  const last = coords.length - 1;
  return {
    coords,
    cumDistM,
    distanceM: cumDistM[last] ?? 0,
    durationS,
    steps: rawSteps.map((st) => {
      const beginIndex = Math.min(Math.max(st.beginIndex, 0), last);
      return { ...st, beginIndex, beginDistM: cumDistM[beginIndex] };
    }),
    bbox: [w, s, e, n],
  };
}

interface OsrmLane {
  indications: string[];
  valid: boolean;
  valid_indication?: string;
}

interface OsrmStep {
  geometry: string;
  name?: string;
  ref?: string;
  destinations?: string;
  exits?: string;
  maneuver: { type: string; modifier?: string; instruction?: string; exit?: number; location: [number, number] };
  intersections?: { lanes?: OsrmLane[]; classes?: string[] }[];
}

interface OsrmResponse {
  routes?: { duration: number; legs: { steps: OsrmStep[] }[] }[];
}

/** Valhalla OSRM-formátumú válasza → Route. A geometria a lépések geometriáinak összefűzése. */
export function parseOsrm(json: unknown): Route {
  const route = (json as OsrmResponse)?.routes?.[0];
  const steps = route?.legs?.[0]?.steps;
  if (!route || !steps?.length) throw new RouteError('no-route');

  const coords: LngLat[] = [];
  const rawSteps: Omit<Step, 'beginDistM'>[] = steps.map((st) => {
    const pts = decodePolyline(st.geometry, 6);
    const last = coords[coords.length - 1];
    const joins = last && pts.length > 0 && last[0] === pts[0][0] && last[1] === pts[0][1];
    const beginIndex = joins ? coords.length - 1 : coords.length;
    coords.push(...(joins ? pts.slice(1) : pts));
    const lanes = st.intersections?.[0]?.lanes;
    return {
      kind: st.maneuver.type,
      modifier: st.maneuver.modifier,
      instruction: st.maneuver.instruction ?? '',
      streetNames: st.name ? [st.name] : [],
      ref: st.ref || undefined,
      destinations: st.destinations || undefined,
      exitNumber: st.exits || undefined,
      roundaboutExit: st.maneuver.exit,
      lanes: lanes?.map((l) => ({ indications: l.indications.length ? l.indications : ['straight'], valid: !!l.valid })),
      beginIndex,
    };
  });
  if (coords.length < 2) throw new RouteError('no-route');
  const hasToll = steps.some((st) => st.intersections?.some((it) => it.classes?.includes('toll')));
  return { ...buildRoute(coords, route.duration, rawSteps), hasToll };
}

/** Valhalla costing_options típusonként (a use_tolls: 0 csak kerüli az útdíjat, nem tiltja). */
const COSTING_OPTIONS: Record<RoutePref, object | null> = {
  fast: null,
  short: { shortest: true },
  notoll: { use_tolls: 0 },
};

export async function getRoute(
  from: LngLat,
  to: LngLat,
  mode: Mode,
  signal?: AbortSignal,
  deps?: FetchDeps,
  lang: Lang = 'en',
  pref: RoutePref = 'fast',
): Promise<Route> {
  const body = {
    locations: [
      { lon: from[0], lat: from[1] },
      { lon: to[0], lat: to[1] },
    ],
    costing: mode,
    language: VALHALLA_LANGUAGE[lang],
    units: 'kilometers',
    format: 'osrm',
    ...(COSTING_OPTIONS[pref] ? { costing_options: { [mode]: COSTING_OPTIONS[pref] } } : {}),
  };
  try {
    const json = await fetchJson<unknown>(
      config.valhallaUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': config.userAgent },
        body: JSON.stringify(body),
        signal,
      },
      deps,
    );
    return parseOsrm(json);
  } catch (e) {
    if (isAbortError(e) || e instanceof RouteError) throw e;
    if (e instanceof HttpError) {
      if (e.kind === 'http' && e.status === 400) throw new RouteError('no-route');
      if (e.kind === 'rate-limited') throw new RouteError('rate-limited');
    }
    throw new RouteError('network');
  }
}

/** Két útvonal gyakorlatilag ugyanaz, ha a hossza és az ideje 1%-on belül egyezik (ekkor csak egyet mutatunk). */
export function sameRoute(a: Route, b: Route): boolean {
  const close = (x: number, y: number) => Math.abs(x - y) <= 0.01 * Math.max(x, y, 1);
  return close(a.distanceM, b.distanceM) && close(a.durationS, b.durationS);
}

/** Csak útdíjas találat van (a választott és az alternatíva is útdíjas, vagy nincs alternatíva): kell egy útdíj nélküli is. */
export function needsTollFree(route: Route, alt: Route | null): boolean {
  return !!route.hasToll && (!alt || !!alt.hasToll);
}
