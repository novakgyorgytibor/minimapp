import type { LngLat, Route } from '../types';
import { routeSlice } from './maneuverSegments';

/** A megtett (halványabban rajzolt) és a még előttünk álló útvonalrész. */
export function splitRoute(route: Route, distAlongM: number): { done: LngLat[]; ahead: LngLat[] } {
  const d = Math.min(Math.max(distAlongM, 0), route.distanceM);
  const done = d > 0 ? routeSlice(route, 0, d) : [];
  const ahead = d < route.distanceM ? routeSlice(route, d, route.distanceM) : [];
  return { done: done.length > 1 ? done : [], ahead: ahead.length > 1 ? ahead : [] };
}

/** 10 m-es lépésekre kerekítve: a megtett rész csak ennyi haladásonként rajzolódik újra. */
export function doneBucketM(distAlongM: number): number {
  return Math.floor(distAlongM / 10) * 10;
}
