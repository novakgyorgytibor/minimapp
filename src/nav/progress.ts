import { lineString } from '@turf/helpers';
import nearestPointOnLine from '@turf/nearest-point-on-line';
import type { LngLat, Route } from '../types';

export interface Progress {
  distAlongM: number;
  distFromRouteM: number;
  nextStepIndex: number;
  distToManeuverM: number;
  remainingM: number;
  remainingS: number;
}

export function snap(pos: LngLat, route: Route): Progress {
  const nearest = nearestPointOnLine(lineString(route.coords), pos, { units: 'meters' });
  const distAlongM = Math.min(nearest.properties.totalDistance, route.distanceM);
  const distFromRouteM = nearest.properties.pointDistance;

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

  return { distAlongM, distFromRouteM, nextStepIndex, distToManeuverM, remainingM, remainingS };
}
