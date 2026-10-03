import type { LngLat, Route } from '../types';
import { haversineM } from './geo';

export interface Progress {
  distAlongM: number;
  distFromRouteM: number;
  nextStepIndex: number;
  distToManeuverM: number;
  remainingM: number;
  remainingS: number;
  /** A pozíció az útvonalra illesztve (a jelölő megjelenítéséhez). */
  snappedPos: LngLat;
}

/** Az előző illesztés: ehhez képest folytatjuk, ha az útvonal többször is áthalad ugyanott (oda-vissza). */
export interface SnapHint {
  alongM: number;
  pos: LngLat;
}

// Ennyivel lehet távolabb egy másik áthaladás a legközelebbinél, hogy még szóba jöjjön (GPS-zaj, kétirányú út)
const PASS_TOLERANCE_M = 15;
// Fordulópontnál a két szomszédos szakasz egyformán közel van (kerekítés)
const LOCAL_MIN_SLACK_M = 0.5;
const M_PER_DEG_LAT = 111_195;

interface Candidate {
  i: number;
  distM: number;
  alongM: number;
  pos: LngLat;
}

/** A pos-hoz legközelebbi pont szakaszonként (rövid szakaszokra síkközelítés a pos körül). */
function candidates(pos: LngLat, route: Route): Candidate[] {
  const { coords, cumDistM } = route;
  const kx = M_PER_DEG_LAT * Math.cos((pos[1] * Math.PI) / 180);
  const out: Candidate[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const ax = (coords[i][0] - pos[0]) * kx;
    const ay = (coords[i][1] - pos[1]) * M_PER_DEG_LAT;
    const dx = (coords[i + 1][0] - coords[i][0]) * kx;
    const dy = (coords[i + 1][1] - coords[i][1]) * M_PER_DEG_LAT;
    const len2 = dx * dx + dy * dy;
    const t = len2 > 0 ? Math.min(Math.max(-(ax * dx + ay * dy) / len2, 0), 1) : 0;
    const px = ax + t * dx;
    const py = ay + t * dy;
    out.push({
      i,
      distM: Math.hypot(px, py),
      alongM: cumDistM[i] + t * (cumDistM[i + 1] - cumDistM[i]),
      pos: [coords[i][0] + t * (coords[i + 1][0] - coords[i][0]), coords[i][1] + t * (coords[i + 1][1] - coords[i][1])],
    });
  }
  return out;
}

/**
 * A legközelebbi útvonalpont. Ha az útvonal többször is áthalad ugyanott (pl. oda-vissza ugyanazon az úton),
 * az előző illesztés folytatását választjuk: azt az áthaladást, amelyik a várható megtett távhoz
 * (előző + azóta megtett út) a legközelebb van, a visszalépést büntetve. Áthaladásnak csak a távolság helyi minimuma számít,
 * így egy kanyar sarokpontja nem húzza vissza az illesztést.
 */
function nearest(pos: LngLat, route: Route, hint?: SnapHint): Candidate {
  const all = candidates(pos, route);
  if (all.length === 0) return { i: 0, distM: haversineM(pos, route.coords[0]), alongM: 0, pos: route.coords[0] };
  let best = all[0];
  for (const c of all) if (c.distM < best.distM) best = c;
  if (!hint) return best;
  const expected = hint.alongM + haversineM(hint.pos, pos);
  // Az előző illesztés mögé visszalépés duplán számít: fordulópont után a visszaút a folytatás
  const score = (c: Candidate) => Math.abs(c.alongM - expected) + Math.max(0, hint.alongM - c.alongM);
  let pick = best;
  let pickScore = score(best);
  for (const c of all) {
    if (c === best || c.distM > best.distM + PASS_TOLERANCE_M) continue;
    const prev = all[c.i - 1];
    const next = all[c.i + 1];
    const localMin = (!prev || c.distM <= prev.distM + LOCAL_MIN_SLACK_M) && (!next || c.distM <= next.distM + LOCAL_MIN_SLACK_M);
    if (!localMin) continue;
    const sc = score(c);
    if (sc < pickScore) {
      pick = c;
      pickScore = sc;
    }
  }
  return pick;
}

/** A legközelebbi útvonalpont: megtett táv (m), távolság az útvonaltól (m) és a pont maga. */
export function nearestOnRoute(pos: LngLat, route: Route, hint?: SnapHint): { alongM: number; distM: number; pos: LngLat } {
  const { alongM, distM, pos: p } = nearest(pos, route, hint);
  return { alongM: Math.min(alongM, route.distanceM), distM, pos: p };
}

export function snap(pos: LngLat, route: Route, hint?: SnapHint): Progress {
  const near = nearest(pos, route, hint);
  const distAlongM = Math.min(near.alongM, route.distanceM);
  const distFromRouteM = near.distM;

  const last = route.steps.length - 1;
  let nextStepIndex = last;
  for (let i = 1; i < route.steps.length; i++) {
    if (route.steps[i].beginDistM > distAlongM) {
      nextStepIndex = i;
      break;
    }
  }
  const distToManeuverM = Math.max(0, route.steps[nextStepIndex].beginDistM - distAlongM);
  const remainingM = Math.max(0, route.distanceM - distAlongM);
  const remainingS = route.distanceM > 0 ? route.durationS * (remainingM / route.distanceM) : 0;

  return { distAlongM, distFromRouteM, nextStepIndex, distToManeuverM, remainingM, remainingS, snappedPos: near.pos };
}
