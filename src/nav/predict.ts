import { config } from '../config';
import type { LngLat, Route } from '../types';
import { EARTH_RADIUS_M } from './geo';

/** Az útvonal pontja az elejétől mért d távolságnál (m), az útvonalra korlátozva. */
export function pointAlong(route: Route, d: number): LngLat {
  const { coords, cumDistM } = route;
  const last = coords.length - 1;
  if (d <= 0) return coords[0];
  if (d >= cumDistM[last]) return coords[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumDistM[mid] <= d) lo = mid;
    else hi = mid;
  }
  const seg = cumDistM[hi] - cumDistM[lo];
  const t = seg > 0 ? (d - cumDistM[lo]) / seg : 0;
  return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * t, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * t];
}

/** A pos-tól bearing irányba distM-re lévő pont (rövid távra síkközelítés). */
export function offsetPoint(pos: LngLat, bearingDeg: number, distM: number): LngLat {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (distM * Math.cos(b)) / EARTH_RADIUS_M;
  const dLng = (distM * Math.sin(b)) / (EARTH_RADIUS_M * Math.cos((pos[1] * Math.PI) / 180));
  return [pos[0] + (dLng * 180) / Math.PI, pos[1] + (dLat * 180) / Math.PI];
}

export interface PredictInput {
  pos: LngLat;
  speedMps: number | null;
  heading: number | null;
  /** Ha az útvonalon vagyunk: az útvonal és a megtett táv rajta → az út mentén becslünk. */
  onRoute: { route: Route; distAlongM: number } | null;
  leadS: number;
}

/**
 * Előrebecslés: hol leszünk leadS másodperc múlva a mostani sebességgel. Az útvonalon az út mentén
 * (kanyarban is az úton marad, a célon nem fut túl), letérve egyenesen a menetirányban.
 * Lassan (ahol az irány már megbízhatatlan) nem becslünk.
 */
export function predictPos({ pos, speedMps, heading, onRoute, leadS }: PredictInput): LngLat {
  const v = speedMps ?? 0;
  if (v < config.courseMinSpeedMps) return pos;
  const ahead = v * leadS;
  if (onRoute) return pointAlong(onRoute.route, Math.min(onRoute.distAlongM + ahead, onRoute.route.distanceM));
  if (heading === null) return pos;
  return offsetPoint(pos, heading, ahead);
}
