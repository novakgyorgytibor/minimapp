import { config } from '../config';
import type { LngLat } from '../types';
import { EARTH_RADIUS_M } from './geo';
import { angleDiff } from './heading';
import { offsetPoint } from './predict';

/** Útvonal nélkül, haladás közben ennél messzebbi útra nem illesztünk (pl. parkoló, földút, ami nincs a térképen). */
export const ROAD_SNAP_MAX_M = 25;
// Ennél jobban a menetiránytól eltérő út nem jöhet szóba (pl. kereszteződésben a keresztutca)
const MAX_ANGLE_DEG = 50;
// Pontszám: távolság (m) + szögeltérés × ennyi (m / fok) → a menetirányba eső út előnyben, ha kicsit messzebb is van
const ANGLE_WEIGHT_M_PER_DEG = 0.3;

export interface RoadSnap {
  pos: LngLat;
  /** Az út iránya a pontban, a menetirányhoz közelebbi irányban (fok, észak = 0). */
  bearing: number;
  distM: number;
}

const rad = (d: number) => (d * Math.PI) / 180;

/**
 * A pozícióhoz legközelebbi, a menetirányba eső útszakasz pontja (a térképen látható utak vonalai közül).
 * heading null → csak a távolság számít. Nincs elég közeli út → null.
 */
export function snapToRoads(pos: LngLat, heading: number | null, lines: LngLat[][], maxM = ROAD_SNAP_MAX_M): RoadSnap | null {
  // Helyi síkközelítés a pos körül (méterben)
  const kx = rad(1) * EARTH_RADIUS_M * Math.cos(rad(pos[1]));
  const ky = rad(1) * EARTH_RADIUS_M;
  const toXY = (c: LngLat): [number, number] => [(c[0] - pos[0]) * kx, (c[1] - pos[1]) * ky];
  let best: (RoadSnap & { score: number }) | null = null;
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, ay] = toXY(line[i]);
      const [bx, by] = toXY(line[i + 1]);
      const dx = bx - ax;
      const dy = by - ay;
      const len2 = dx * dx + dy * dy;
      if (len2 < 1e-6) continue;
      const t = Math.min(Math.max(-(ax * dx + ay * dy) / len2, 0), 1);
      const px = ax + t * dx;
      const py = ay + t * dy;
      const distM = Math.hypot(px, py);
      if (distM > maxM) continue;
      const segBearing = ((Math.atan2(dx, dy) * 180) / Math.PI + 360) % 360;
      let bearing = segBearing;
      let angle = 0;
      if (heading !== null) {
        const fwd = angleDiff(heading, segBearing);
        bearing = fwd <= 90 ? segBearing : (segBearing + 180) % 360;
        angle = Math.min(fwd, 180 - fwd);
        if (angle > MAX_ANGLE_DEG) continue;
      }
      const score = distM + angle * ANGLE_WEIGHT_M_PER_DEG;
      if (!best || score < best.score) {
        best = { pos: [pos[0] + px / kx, pos[1] + py / ky], bearing, distM, score };
      }
    }
  }
  return best && { pos: best.pos, bearing: best.bearing, distM: best.distM };
}

/** GeoJSON (Multi)LineString feature-ök vonalai; minden más geometria kimarad. */
export function featureLines(features: GeoJSON.Feature[]): LngLat[][] {
  const out: LngLat[][] = [];
  for (const f of features) {
    const g = f.geometry;
    if (!g) continue;
    if (g.type === 'LineString') out.push(g.coordinates as LngLat[]);
    else if (g.type === 'MultiLineString') out.push(...(g.coordinates as LngLat[][]));
  }
  return out;
}

/**
 * Útvonal nélküli, haladás közbeni jelölő/kamera-célpont: az útra illesztett pont, az út irányába fordulva, és ahogy
 * navigációban, leadS másodperccel előrebecsülve (az út irányában). Út nélkül a nyers pozíció és a menetirány.
 */
export function rollingPose(
  { pos, snap }: { pos: LngLat; snap: RoadSnap | null },
  speedMps: number | null,
  heading: number | null,
  leadS: number,
): { pos: LngLat; heading: number | null } {
  const base = snap?.pos ?? pos;
  const bearing = snap?.bearing ?? heading;
  const v = speedMps ?? 0;
  if (bearing === null || v < config.courseMinSpeedMps) return { pos: base, heading: bearing };
  return { pos: offsetPoint(base, bearing, v * leadS), heading: bearing };
}
