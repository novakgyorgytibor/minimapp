import type { FeatureCollection, LineString } from 'geojson';
import type { LngLat, Route, Step } from '../types';
import { haversineM } from './geo';

const REAL_KINDS = new Set([
  'turn',
  'end of road',
  'fork',
  'merge',
  'on ramp',
  'off ramp',
  'roundabout',
  'rotary',
  'roundabout turn',
  'exit roundabout',
  'exit rotary',
]);

/** Valódi manőver (kanyar, lehajtó, elágazás, körforgalom, visszafordulás) – nem egyenes továbbhaladás. */
export function isRealManeuver(step: Step): boolean {
  if (step.kind === 'depart' || step.kind === 'arrive') return false;
  if (REAL_KINDS.has(step.kind)) return true;
  // new name / continue / notification: csak ha tényleg fordulni kell
  return !!step.modifier && step.modifier !== 'straight';
}

/** Az útvonal pontja a d távolságnál (m), lineáris interpolációval. */
function pointAt(route: Pick<Route, 'coords' | 'cumDistM'>, d: number, i: number): LngLat {
  const { coords, cumDistM } = route;
  const seg = cumDistM[i + 1] - cumDistM[i];
  const t = seg > 0 ? (d - cumDistM[i]) / seg : 0;
  return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
}

/** Az útvonal from..to (m) közötti része, a végpontokon interpolálva. */
export function routeSlice(route: Pick<Route, 'coords' | 'cumDistM'>, from: number, to: number): LngLat[] {
  const { coords, cumDistM } = route;
  const out: LngLat[] = [];
  for (let i = 0; i < coords.length - 1; i++) {
    const a = cumDistM[i];
    const b = cumDistM[i + 1];
    if (b < from) continue;
    if (a > to) break;
    if (out.length === 0) out.push(a >= from ? coords[i] : pointAt(route, from, i));
    if (b <= to) out.push(coords[i + 1]);
    else {
      out.push(pointAt(route, to, i));
      break;
    }
  }
  return out;
}

function segmentFor(route: Route, st: Step, beforeM: number, afterM: number) {
  const from = Math.max(0, st.beginDistM - beforeM);
  const to = Math.min(route.distanceM, st.beginDistM + afterM);
  const line = routeSlice(route, from, to);
  return line.length > 1
    ? [{ type: 'Feature' as const, properties: {}, geometry: { type: 'LineString' as const, coordinates: line } }]
    : [];
}

/** Szakaszok az összes valódi manőver körül (beforeM-rel előtte, afterM-rel utána). */
export function maneuverSegments(route: Route, beforeM: number, afterM: number): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: route.steps.filter(isRealManeuver).flatMap((st) => segmentFor(route, st, beforeM, afterM)),
  };
}

/**
 * Csak a következő manőver kiemelése (navigáció közben); ha az nem valódi manőver, üres.
 * `hideWithinM`: ennél közelebb a manőverhez már eltűnik (odaérve ne takarja a kanyart).
 */
export function nextManeuverSegment(
  route: Route,
  stepIndex: number,
  beforeM: number,
  afterM: number,
  near?: { distToManeuverM: number; hideWithinM: number },
): FeatureCollection<LineString> {
  const st = route.steps[stepIndex];
  if (near && near.distToManeuverM < near.hideWithinM) return { type: 'FeatureCollection', features: [] };
  return {
    type: 'FeatureCollection',
    features: st && isRealManeuver(st) ? segmentFor(route, st, beforeM, afterM) : [],
  };
}

/** A vastagítás egy darabja; t: 0 = a sima útvonal vastagsága, 1 = teljes vastagítás. */
export type TaperedFeatures = FeatureCollection<LineString, { t: number }>;

/**
 * A szakaszok két végét `steps` lépcsőben, `taperM` hosszon a sima útvonal vastagságáig vékonyítja, így a
 * vastagítás belesimul a vékony vonalba. Rövid szakasznál a vékonyítás arányosan rövidül.
 */
export function taperedSegment(fc: FeatureCollection<LineString>, taperM: number, steps: number): TaperedFeatures {
  const features: TaperedFeatures['features'] = [];
  for (const f of fc.features) {
    const coords = f.geometry.coordinates as LngLat[];
    if (coords.length < 2) continue;
    const cumDistM = [0];
    for (let i = 1; i < coords.length; i++) cumDistM.push(cumDistM[i - 1] + haversineM(coords[i - 1], coords[i]));
    const line = { coords, cumDistM };
    const len = cumDistM[cumDistM.length - 1];
    const taper = Math.min(taperM, len / 2);
    const step = taper / steps;
    const piece = (from: number, to: number, t: number) => {
      const c = routeSlice(line, from, to);
      if (c.length > 1) features.push({ type: 'Feature', properties: { t }, geometry: { type: 'LineString', coordinates: c } });
    };
    for (let k = 0; k < steps; k++) piece(k * step, (k + 1) * step, (k + 0.5) / steps);
    piece(taper, len - taper, 1);
    for (let k = steps - 1; k >= 0; k--) piece(len - (k + 1) * step, len - k * step, (k + 0.5) / steps);
  }
  return { type: 'FeatureCollection', features };
}
