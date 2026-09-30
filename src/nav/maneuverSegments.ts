import type { FeatureCollection, LineString } from 'geojson';
import type { LngLat, Route, Step } from '../types';

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
function pointAt(route: Route, d: number, i: number): LngLat {
  const { coords, cumDistM } = route;
  const seg = cumDistM[i + 1] - cumDistM[i];
  const t = seg > 0 ? (d - cumDistM[i]) / seg : 0;
  return [coords[i][0] + (coords[i + 1][0] - coords[i][0]) * t, coords[i][1] + (coords[i + 1][1] - coords[i][1]) * t];
}

function slice(route: Route, from: number, to: number): LngLat[] {
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
  const line = slice(route, from, to);
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

/** Csak a következő manőver kiemelése (navigáció közben); ha az nem valódi manőver, üres. */
export function nextManeuverSegment(
  route: Route,
  stepIndex: number,
  beforeM: number,
  afterM: number,
): FeatureCollection<LineString> {
  const st = route.steps[stepIndex];
  return {
    type: 'FeatureCollection',
    features: st && isRealManeuver(st) ? segmentFor(route, st, beforeM, afterM) : [],
  };
}
