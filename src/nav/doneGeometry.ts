import type { LngLat, Route } from '../types';
import { routeSlice } from './maneuverSegments';

/**
 * A megtett útszakasz két darabban: a durva rész (az útvonal elejétől az utolsó `stepM`-es
 * rácspontig) ritkán változik, a vége (onnan pontosan a megtett távolságig) rövid és minden
 * méréskor frissül. Így a határ pontosan a jelölőnél van, mégsem kell minden GPS-méréskor a
 * teljes útvonalat újraküldeni.
 */
export function doneGeometry(route: Route, distAlongM: number, stepM: number): { coarse: LngLat[]; tail: LngLat[] } {
  const d = Math.min(Math.max(distAlongM, 0), route.distanceM);
  if (d <= 0) return { coarse: [], tail: [] };
  const grid = Math.floor(d / stepM) * stepM;
  const coarse = grid > 0 ? routeSlice(route, 0, grid) : [];
  const tail = routeSlice(route, grid, d);
  return { coarse: coarse.length > 1 ? coarse : [], tail: tail.length > 1 ? tail : [] };
}
