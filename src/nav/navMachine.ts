import { config } from '../config';
import type { RouteErrorKind } from '../services/route';
import type { LngLat, Mode, Route, RoutePref } from '../types';
import { haversineM } from './geo';
import { snap, type Progress } from './progress';

export type { RoutePref };

export type Phase = 'idle' | 'searching' | 'preview' | 'navigating' | 'rerouting' | 'arrived';

export interface NavState {
  phase: Phase;
  mode: Mode;
  dest: LngLat | null;
  destLabel: string | null;
  route: Route | null;
  /** Előnézetben a másik (leggyorsabb ↔ legrövidebb, vagy útdíj nélküli) útvonal, ha érdemben különbözik. */
  alt: Route | null;
  /** Az alternatíva típusa (kiválasztásakor ez lesz a pref). */
  altPref: RoutePref | null;
  /** Melyik típust választotta a felhasználó (újratervezésnél is ezt kérjük). */
  pref: RoutePref;
  progress: Progress | null;
  loading: boolean;
  requestId: number;
  error: RouteErrorKind | null;
  offRouteCount: number;
  lastRerouteAt: number;
}

export type NavEvent =
  | { type: 'OPEN_SEARCH' }
  | { type: 'CLOSE_SEARCH' }
  | { type: 'SET_DEST'; dest: LngLat; label: string }
  | { type: 'SET_MODE'; mode: Mode }
  | { type: 'ROUTE_OK'; route: Route; alt?: Route | null; altPref?: RoutePref; requestId: number }
  | { type: 'SELECT_ALT' }
  | { type: 'ROUTE_FAIL'; error: RouteErrorKind; requestId: number }
  | { type: 'RETRY' }
  | { type: 'START' }
  /** pos: simított (megjelenítés, haladás); raw: a nyers mérés, ha elég pontos (a letérés gyorsabb észleléséhez). */
  | { type: 'POSITION'; pos: LngLat; raw?: LngLat | null; now: number }
  | { type: 'CANCEL' };

export function initialNavState(mode: Mode = 'auto'): NavState {
  return {
    phase: 'idle',
    mode,
    dest: null,
    destLabel: null,
    route: null,
    alt: null,
    altPref: null,
    pref: 'fast',
    progress: null,
    loading: false,
    requestId: 0,
    error: null,
    offRouteCount: 0,
    lastRerouteAt: -Infinity,
  };
}

/** Előnézetben a választott mellé ezt kérjük alternatívának. */
export function otherPref(p: RoutePref): RoutePref {
  return p === 'fast' ? 'short' : 'fast';
}

const request = (s: NavState): NavState => ({ ...s, loading: true, error: null, requestId: s.requestId + 1 });

function onPosition(s: NavState, pos: LngLat, raw: LngLat | null, now: number): NavState {
  if ((s.phase !== 'navigating' && s.phase !== 'rerouting') || !s.route) return s;
  const route = s.route;
  const progress = snap(pos, route);
  if (haversineM(pos, route.coords[route.coords.length - 1]) <= config.arrivalM) {
    return { ...s, phase: 'arrived', progress, loading: false };
  }
  if (s.phase === 'rerouting') return { ...s, progress };

  const distFromRouteM = raw ? snap(raw, route).distFromRouteM : progress.distFromRouteM;
  const offRouteCount = distFromRouteM > config.offRouteM[s.mode] ? s.offRouteCount + 1 : 0;
  if (offRouteCount >= config.offRouteSamples[s.mode] && now - s.lastRerouteAt >= config.rerouteMinIntervalMs[s.mode]) {
    return request({ ...s, phase: 'rerouting', progress, offRouteCount: 0, lastRerouteAt: now });
  }
  return { ...s, progress, offRouteCount };
}

export function navReducer(s: NavState, e: NavEvent): NavState {
  switch (e.type) {
    case 'OPEN_SEARCH':
      return s.phase === 'idle' || s.phase === 'preview' ? { ...s, phase: 'searching' } : s;
    case 'CLOSE_SEARCH':
      if (s.phase !== 'searching') return s;
      return { ...s, phase: s.dest ? 'preview' : 'idle' };
    case 'SET_DEST':
      if (s.phase !== 'idle' && s.phase !== 'searching' && s.phase !== 'preview') return s;
      return request({ ...s, phase: 'preview', dest: e.dest, destLabel: e.label, route: null, alt: null, altPref: null, pref: 'fast', progress: null });
    case 'SET_MODE':
      if (e.mode === s.mode) return s;
      if (s.phase === 'preview' && s.dest) return request({ ...s, mode: e.mode, route: null, alt: null, altPref: null, pref: 'fast' });
      if (s.phase === 'idle' || s.phase === 'searching') return { ...s, mode: e.mode };
      return s;
    case 'ROUTE_OK':
      if (e.requestId !== s.requestId || !s.loading) return s;
      if (s.phase === 'rerouting') {
        return { ...s, phase: 'navigating', route: e.route, progress: null, loading: false, offRouteCount: 0 };
      }
      if (!e.alt) return { ...s, route: e.route, alt: null, altPref: null, loading: false };
      return { ...s, route: e.route, alt: e.alt, altPref: e.altPref ?? otherPref(s.pref), loading: false };
    case 'ROUTE_FAIL':
      if (e.requestId !== s.requestId || !s.loading) return s;
      if (s.phase === 'rerouting') {
        return { ...s, phase: 'navigating', loading: false, error: e.error, offRouteCount: 0 };
      }
      return { ...s, loading: false, error: e.error };
    case 'RETRY':
      if (!s.dest || s.loading) return s;
      if (s.phase === 'preview') return request(s);
      if (s.phase === 'navigating') return request({ ...s, phase: 'rerouting' });
      return s;
    case 'SELECT_ALT':
      if (s.phase !== 'preview' || !s.alt || !s.route || s.loading) return s;
      return { ...s, route: s.alt, alt: s.route, pref: s.altPref ?? otherPref(s.pref), altPref: s.pref };
    case 'START':
      if (s.phase !== 'preview' || !s.route || s.loading) return s;
      return { ...s, phase: 'navigating', alt: null, altPref: null, progress: null, offRouteCount: 0, error: null };
    case 'POSITION':
      return onPosition(s, e.pos, e.raw ?? null, e.now);
    case 'CANCEL':
      return { ...initialNavState(s.mode), requestId: s.requestId + 1 };
  }
}
