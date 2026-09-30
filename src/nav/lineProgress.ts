import type { LngLat, Route } from '../types';

function mercator([lng, lat]: LngLat): [number, number] {
  const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return [lng / 360, y / (2 * Math.PI)];
}

/** Kumulált hossz a Mercator-síkon (a MapLibre `line-progress` is ebben mér). */
export function mercatorCumulative(coords: LngLat[]): number[] {
  const out = [0];
  let prev = mercator(coords[0]);
  for (let i = 1; i < coords.length; i++) {
    const p = mercator(coords[i]);
    out.push(out[i - 1] + Math.hypot(p[0] - prev[0], p[1] - prev[1]));
    prev = p;
  }
  return out;
}

/**
 * A megtett távolság (m) a vonal `line-progress` arányában (0..1), hogy a halvány/fényes határ
 * pontosan a jelölőnél legyen. A méterből a szakaszon belüli arányt vesszük, azt a Mercator-hosszra vetítjük.
 */
export function lineProgressAt(route: Route, merc: number[], distAlongM: number): number {
  const { cumDistM } = route;
  const last = cumDistM.length - 1;
  const total = merc[last];
  if (distAlongM <= 0 || total <= 0) return 0;
  if (distAlongM >= cumDistM[last]) return 1;
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cumDistM[mid] <= distAlongM) lo = mid;
    else hi = mid;
  }
  const seg = cumDistM[hi] - cumDistM[lo];
  const t = seg > 0 ? (distAlongM - cumDistM[lo]) / seg : 0;
  return (merc[lo] + t * (merc[hi] - merc[lo])) / total;
}
