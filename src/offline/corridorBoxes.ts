import { routeSlice } from '../nav/maneuverSegments';
import type { Route } from '../types';

/** [west, south, east, north] */
export type Bbox = [number, number, number, number];

const M_PER_DEG_LAT = 111_320;

/**
 * Az útvonal mentén legfeljebb chunkM hosszú darabok befoglaló téglalapjai, padM ráhagyással. A letöltés
 * csak téglalapot ismer: egy nagy téglalap átlós útvonalnál a fölösleges terület miatt sokszoros lenne,
 * a rövid darabok téglalapjai együtt szorosan követik az utat.
 */
export function corridorBoxes(route: Route, chunkM: number, padM: number): Bbox[] {
  if (route.coords.length === 0) return [];
  const n = Math.max(1, Math.ceil(route.distanceM / chunkM));
  const boxes: Bbox[] = [];
  for (let k = 0; k < n; k++) {
    // Távolság szerint vágunk (a hosszú egyenes szakaszok is darabolódnak); a határpont mindkét darabban
    // benne van → nincs rés a téglalapok között
    const part = route.coords.length > 1 ? routeSlice(route, k * chunkM, Math.min((k + 1) * chunkM, route.distanceM)) : route.coords;
    const pts = part.length > 0 ? part : [route.coords[0]];
    let [w, s, e, nn] = [pts[0][0], pts[0][1], pts[0][0], pts[0][1]];
    for (const [x, y] of pts) {
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      nn = Math.max(nn, y);
    }
    const dLat = padM / M_PER_DEG_LAT;
    const dLng = padM / (M_PER_DEG_LAT * Math.cos((((s + nn) / 2) * Math.PI) / 180));
    boxes.push([w - dLng, s - dLat, e + dLng, nn + dLat]);
  }
  return boxes;
}
