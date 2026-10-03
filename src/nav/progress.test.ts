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

test('snappedPos is the nearest point on the route', () => {
  const p = snap([19.002, 47.5 + 30 / M_PER_DEG_LAT], route);
  expect(p.snappedPos[0]).toBeCloseTo(19.002, 6);
  expect(p.snappedPos[1]).toBeCloseTo(47.5, 6);
});

describe('out-and-back route (the same road there and back)', () => {
  // Kelet felé 5 pont (~300 m), majd ugyanazon az úton vissza: a visszaút pontjai egybeesnek az odaúttal
  const out: LngLat[] = Array.from({ length: 5 }, (_, i) => [19 + i * 0.001, 47.5]);
  const back = out.slice(0, -1).reverse();
  const r = buildRoute([...out, ...back], 600, [
    { kind: 'depart', instruction: 'Start', streetNames: [], beginIndex: 0 },
    { kind: 'arrive', instruction: 'Arrive', streetNames: [], beginIndex: 8 },
  ]);
  const legM = r.cumDistM[4];
  const at = (lng: number): LngLat => [lng, 47.5];

  test('without a previous position the first pass wins', () => {
    expect(snap(at(19.001), r).distAlongM).toBeCloseTo(r.cumDistM[1], 0);
  });

  test('on the way back it stays on the return leg', () => {
    // az előző illesztés a visszaúton, 19.002-nél volt; most 19.001-nél járunk (~75 m-rel később)
    const prev = snap(at(19.002), r, { alongM: r.cumDistM[6], pos: at(19.002) });
    expect(prev.distAlongM).toBeCloseTo(r.cumDistM[6], 0);
    const p = snap(at(19.001), r, { alongM: prev.distAlongM, pos: at(19.002) });
    expect(p.distAlongM).toBeCloseTo(r.cumDistM[7], 0);
    expect(p.distFromRouteM).toBeCloseTo(0, 0);
  });

  test('on the way out it stays on the outbound leg', () => {
    const p = snap(at(19.002), r, { alongM: r.cumDistM[1], pos: at(19.001) });
    expect(p.distAlongM).toBeCloseTo(r.cumDistM[2], 0);
  });

  test('right after the turnaround it continues on the return leg', () => {
    // az előző mérés a fordulópont előtt 10 m-rel, most 20 m-rel visszafelé a fordulóponttól
    const tip = 19.004;
    const dLng = 0.001 / 75.12; // ≈ 1 m
    const p = snap(at(tip - 20 * dLng), r, { alongM: legM - 10, pos: at(tip - 10 * dLng) });
    expect(p.distAlongM).toBeCloseTo(legM + 20, -1);
  });

  test('a corner of a single pass does not pull the snap back to the vertex', () => {
    // L alakú út: kelet, majd észak; 10 m-rel a sarok után, az előző mérés 5 m-rel előtte
    const l = buildRoute([[19, 47.5], [19.002, 47.5], [19.002, 47.502]], 100, [
      { kind: 'depart', instruction: 'Start', streetNames: [], beginIndex: 0 },
      { kind: 'arrive', instruction: 'Arrive', streetNames: [], beginIndex: 2 },
    ]);
    const corner = l.cumDistM[1];
    const p = snap([19.002, 47.5 + 10 / M_PER_DEG_LAT], l, { alongM: corner - 5, pos: [19.002 - 5 * 0.001 / 75.12, 47.5] });
    expect(p.distAlongM).toBeCloseTo(corner + 10, 0);
  });
});
