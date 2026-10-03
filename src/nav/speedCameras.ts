import type { LngLat, Route } from '../types';
import { haversineM } from './geo';
import { angleDiff } from './heading';
import { routeBearingAt } from './predict';
import { nearestOnRoute } from './progress';

/** Fix traffipax (OSM highway=speed_camera). dir: a mért forgalom iránya fokban; null = ismeretlen / több irány. */
export interface Camera {
  pos: LngLat;
  maxspeed: number | null;
  dir: number | null;
}

export interface CameraAhead {
  camera: Camera;
  /** Távolság a kameráig (m): útvonalon az útvonal mentén, különben légvonalban. */
  distM: number;
}

export interface RouteCamera {
  camera: Camera;
  alongM: number;
}

// Ennyi másodpercnyi út előre figyelmeztetünk, legalább / legfeljebb ennyi méterrel
const WARN_AHEAD_S = 20;
const WARN_MIN_M = 300;
const WARN_MAX_M = 800;
// Útvonal nélkül: a menetirány ±ennyi fokos kúpjában lévő kamera számít előttünk lévőnek
const AHEAD_CONE_DEG = 25;
// A kamera ennyire térhet el a menetiránytól, hogy a mi irányunkat mérje
const DIR_MATCH_DEG = 60;
// Ennyin belül a kamera az útvonalon van (a csomópont / szemközti sáv még belefér, a párhuzamos utca már nem)
const ON_ROUTE_M = 20;
const M_PER_DEG_LAT = 111_195;

export interface CameraData {
  /** Az export napja (ÉÉÉÉ-HH-NN); '' = ismeretlen. */
  updated: string;
  cameras: Camera[];
}

/** A tömör export ({ updated, cameras: [lng, lat, maxspeed, dir][] }) ellenőrzése; sérült adat ne törje el az appot. */
export function parseCameraData(data: unknown): CameraData {
  const obj = (data && typeof data === 'object' ? data : {}) as { updated?: unknown; cameras?: unknown };
  const rows = Array.isArray(obj.cameras) ? obj.cameras : [];
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  return {
    updated: typeof obj.updated === 'string' ? obj.updated : '',
    cameras: rows
      .filter((r): r is unknown[] => Array.isArray(r) && num(r[0]) && num(r[1]))
      .map((r) => ({ pos: [r[0], r[1]] as LngLat, maxspeed: num(r[2]) ? r[2] : null, dir: num(r[3]) ? r[3] : null })),
  };
}

export function parseCameras(json: string | null): Camera[] {
  if (!json) return [];
  try {
    return parseCameraData(JSON.parse(json)).cameras;
  } catch {
    return [];
  }
}

/** A frissebb adat (az export napja szerint); üres listát nem választunk. */
export function newerCameraData(a: CameraData, b: CameraData | null): CameraData {
  if (!b || b.cameras.length === 0) return a;
  if (a.cameras.length === 0) return b;
  return b.updated > a.updated ? b : a;
}

export function warnDistanceM(speedMps: number): number {
  return Math.min(Math.max(speedMps * WARN_AHEAD_S, WARN_MIN_M), WARN_MAX_M);
}

function bearingDeg(a: LngLat, b: LngLat): number {
  const dx = (b[0] - a[0]) * Math.cos((a[1] * Math.PI) / 180);
  const dy = b[1] - a[1];
  return ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
}

const measuresUs = (camera: Camera, travelDeg: number) => camera.dir === null || angleDiff(camera.dir, travelDeg) <= DIR_MATCH_DEG;

/** Az útvonalon lévő, a mi irányunkat mérő kamerák a megtett táv szerint rendezve (útvonalanként egyszer). */
export function camerasOnRoute(cameras: Camera[], route: Route): RouteCamera[] {
  const [w, s, e, n] = route.bbox;
  const padLat = ON_ROUTE_M / M_PER_DEG_LAT;
  const padLng = padLat / Math.cos((((s + n) / 2) * Math.PI) / 180);
  const out: RouteCamera[] = [];
  for (const camera of cameras) {
    const [lng, lat] = camera.pos;
    if (lng < w - padLng || lng > e + padLng || lat < s - padLat || lat > n + padLat) continue;
    const p = nearestOnRoute(camera.pos, route);
    if (p.distM > ON_ROUTE_M) continue;
    if (!measuresUs(camera, routeBearingAt(route, p.alongM, ON_ROUTE_M))) continue;
    out.push({ camera, alongM: p.alongM });
  }
  return out.sort((a, b) => a.alongM - b.alongM);
}

export interface NextCameraInput {
  pos: LngLat;
  heading: number | null;
  speedMps: number;
  cameras: Camera[];
  /** Navigáció közben, az útvonalon: az útvonal kamerái és a megtett táv → az útvonal mentén nézzük. */
  onRoute?: { cameras: RouteCamera[]; distAlongM: number } | null;
}

/** A legközelebbi előttünk lévő kamera a figyelmeztetési távon belül, vagy null. */
export function nextCamera({ pos, heading, speedMps, cameras, onRoute }: NextCameraInput): CameraAhead | null {
  const warnM = warnDistanceM(speedMps);
  if (onRoute) {
    const next = onRoute.cameras.find((c) => c.alongM >= onRoute.distAlongM);
    const distM = next ? next.alongM - onRoute.distAlongM : Infinity;
    return next && distM <= warnM ? { camera: next.camera, distM } : null;
  }
  if (heading === null) return null;
  let best: CameraAhead | null = null;
  for (const camera of cameras) {
    // Gyors előszűrés fokban (a figyelmeztetési táv ~0,01°-on belül)
    if (Math.abs(camera.pos[1] - pos[1]) > 0.01 || Math.abs(camera.pos[0] - pos[0]) > 0.015) continue;
    const distM = haversineM(pos, camera.pos);
    if (distM > warnM || (best && distM >= best.distM)) continue;
    if (angleDiff(bearingDeg(pos, camera.pos), heading) > AHEAD_CONE_DEG) continue;
    if (!measuresUs(camera, heading)) continue;
    best = { camera, distM };
  }
  return best;
}
