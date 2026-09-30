import { config } from '../config';
import { haversineM } from '../nav/geo';
import type { LngLat, Mode, Route, Step } from '../types';
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

interface ValhallaManeuver {
  type: number;
  instruction: string;
  street_names?: string[];
  roundabout_exit_count?: number;
  begin_shape_index: number;
}

interface ValhallaResponse {
  trip: {
    summary: { time: number };
    legs: { shape: string; maneuvers: ValhallaManeuver[] }[];
  };
}

export function parseValhalla(json: unknown): Route {
  const trip = (json as ValhallaResponse)?.trip;
  const leg = trip?.legs?.[0];
  if (!leg) throw new RouteError('no-route');
  const coords = decodePolyline(leg.shape, 6);
  if (coords.length < 2) throw new RouteError('no-route');
  return buildRoute(
    coords,
    trip.summary.time,
    leg.maneuvers.map((m) => ({
      type: m.type,
      instruction: m.instruction,
      streetNames: m.street_names ?? [],
      roundaboutExitCount: m.roundabout_exit_count,
      beginIndex: m.begin_shape_index,
    })),
  );
}

export async function getRoute(
  from: LngLat,
  to: LngLat,
  mode: Mode,
  signal?: AbortSignal,
  deps?: FetchDeps,
): Promise<Route> {
  const body = {
    locations: [
      { lon: from[0], lat: from[1] },
      { lon: to[0], lat: to[1] },
    ],
    costing: mode,
    language: 'hu-HU',
    units: 'kilometers',
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
    return parseValhalla(json);
  } catch (e) {
    if (isAbortError(e) || e instanceof RouteError) throw e;
    if (e instanceof HttpError) {
      if (e.kind === 'http' && e.status === 400) throw new RouteError('no-route');
      if (e.kind === 'rate-limited') throw new RouteError('rate-limited');
    }
    throw new RouteError('network');
  }
}
