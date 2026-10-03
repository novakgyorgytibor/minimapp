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

/**
 * A még előttünk álló rész ugyanígy két darabban: a vége (a megtett távtól a következő `stepM`-es rácspontig)
 * minden méréskor frissül, a durva rész (onnan a célig) csak rácspontonként. A megtett rész fölé rajzoljuk,
 * így ahol az útvonal visszafelé ugyanazon az úton halad, a még megteendő rész fehér marad.
 */
export function aheadGeometry(route: Route, distAlongM: number, stepM: number): { coarse: LngLat[]; tail: LngLat[] } {
  const d = Math.min(Math.max(distAlongM, 0), route.distanceM);
  const grid = Math.min(Math.ceil(d / stepM) * stepM, route.distanceM);
  const tail = grid > d ? routeSlice(route, d, grid) : [];
  const coarse = grid < route.distanceM ? routeSlice(route, grid, route.distanceM) : [];
  return { coarse: coarse.length > 1 ? coarse : [], tail: tail.length > 1 ? tail : [] };
}

/**
 * A megtett / előttünk álló rész minden képkockán frissülő vége a durva darabok (doneGeometry / aheadGeometry a
 * `grid`, ill. `gridAhead` rácspontnál) mellé. A végek egy rácslépésnyit rálógnak a durva darabokra: a különálló
 * források nem ugyanabban a képkockában frissülnek a natív oldalon, így rácspontváltáskor sem marad rés (villanás).
 */
export function progressTails(
  route: Route,
  distAlongM: number,
  stepM: number,
): { grid: number; gridAhead: number; doneTail: LngLat[]; aheadTail: LngLat[] } {
  const d = Math.min(Math.max(distAlongM, 0), route.distanceM);
  const grid = Math.floor(d / stepM) * stepM;
  const gridAhead = Math.min(Math.ceil(d / stepM) * stepM, route.distanceM);
  const doneTail = d > 0 ? routeSlice(route, Math.max(grid - stepM, 0), d) : [];
  const aheadTail = d < route.distanceM ? routeSlice(route, d, Math.min(gridAhead + stepM, route.distanceM)) : [];
  return {
    grid,
    gridAhead,
    doneTail: doneTail.length > 1 ? doneTail : [],
    aheadTail: aheadTail.length > 1 ? aheadTail : [],
  };
}
