import { buildRoute } from '../services/route';
import { snap } from './progress';
import type { LngLat } from '../types';

const M_PER_DEG_LAT = 111_195;
// Kelet felé 10 pont, 0.001° lon lépésekkel (~75 m / lépés 47.5°-on), összesen ~676 m
const coords: LngLat[] = Array.from({ length: 10 }, (_, i) => [19 + i * 0.001, 47.5]);
const route = buildRoute(coords, 600, [
  { kind: 'depart', instruction: 'Start', streetNames: [], beginIndex: 0 },
  { kind: 'turn', modifier: 'right', instruction: 'Turn right', streetNames: ['Fő utca'], beginIndex: 4 },
  { kind: 'arrive', instruction: 'Arrive', streetNames: [], beginIndex: 9 },
]);

test('on the route at the start', () => {
  const p = snap([19, 47.5], route);
  expect(p.distAlongM).toBeCloseTo(0, 0);
  expect(p.distFromRouteM).toBeCloseTo(0, 0);
  expect(p.nextStepIndex).toBe(1);
  expect(p.distToManeuverM).toBeCloseTo(route.cumDistM[4], 0);
  expect(p.remainingM).toBeCloseTo(route.distanceM, 0);
  expect(p.remainingS).toBeCloseTo(600, 0);
});

test('halfway to the turn, 30 m off to the north', () => {
  const p = snap([19.002, 47.5 + 30 / M_PER_DEG_LAT], route);
  expect(p.distFromRouteM).toBeCloseTo(30, 0);
  expect(p.distAlongM).toBeCloseTo(route.cumDistM[2], 0);
  expect(p.nextStepIndex).toBe(1);
  expect(p.distToManeuverM).toBeCloseTo(route.cumDistM[4] - route.cumDistM[2], 0);
});

test('past the turn the next maneuver is the arrival', () => {
  const p = snap([19.006, 47.5], route);
  expect(p.nextStepIndex).toBe(2);
  expect(p.distToManeuverM).toBeCloseTo(route.cumDistM[9] - route.cumDistM[6], 0);
  expect(p.remainingS).toBeCloseTo(600 * (p.remainingM / route.distanceM), 3);
});

test('beyond the end clamps to the last step and zero remaining', () => {
  const p = snap([19.02, 47.5], route);
  expect(p.nextStepIndex).toBe(2);
  expect(p.remainingM).toBeCloseTo(0, 0);
  expect(p.distToManeuverM).toBeCloseTo(0, 0);
});
