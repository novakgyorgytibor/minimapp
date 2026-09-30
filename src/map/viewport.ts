import { haversineM } from '../nav/geo';
import type { LngLat } from '../types';

const EARTH_CIRCUMFERENCE_M = 40_075_016.686;
const M_PER_DEG_LAT = 111_195;

export interface View {
  center: LngLat;
  zoom: number;
}

/** Méter / képernyőpont (MapLibre: 512 px-es csempék). */
export function metersPerPoint(zoom: number, lat: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / (512 * 2 ** zoom);
}

export function screenWidthM(zoom: number, lat: number, widthPt: number): number {
  return metersPerPoint(zoom, lat) * widthPt;
}

export function radiiFor(outerM: number, fractions: readonly number[]): number[] {
  return fractions.map((f) => f * outerM);
}

export function zoomBucket(zoom: number): number {
  return Math.round(zoom * 4) / 4;
}

/** [w, s, e, n] a középpont körül, halfExtentM félszélességgel mindkét irányban. */
export function viewBbox([lng, lat]: LngLat, halfExtentM: number): [number, number, number, number] {
  const dLat = halfExtentM / M_PER_DEG_LAT;
  const dLng = halfExtentM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
  return [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
}

/**
 * A nézet csak érdemi változásnál frissül (zoom 0.25-ös lépésben, vagy a képernyőszélesség 5%-ánál
 * nagyobb elmozdulás); különben ugyanaz az objektum marad → nincs újrarenderelés / maszkszámítás.
 */
export function nextView(prev: View | null, cand: View, widthPt: number): View {
  if (!prev) return cand;
  if (zoomBucket(prev.zoom) !== zoomBucket(cand.zoom)) return cand;
  const step = 0.05 * screenWidthM(prev.zoom, prev.center[1], widthPt);
  return haversineM(prev.center, cand.center) > step ? cand : prev;
}
