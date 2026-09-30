import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { lineProgressAt, mercatorCumulative } from './lineProgress';

// Kelet felé egyenes, egyenletes pontokkal
const east: LngLat[] = Array.from({ length: 11 }, (_, i) => [19 + i * 0.001, 47.5]);
const r = buildRoute(east, 60, []);

test('0 at the start, 1 at the end, 0.5 halfway on a straight line', () => {
  const m = mercatorCumulative(r.coords);
  expect(lineProgressAt(r, m, 0)).toBe(0);
  expect(lineProgressAt(r, m, r.distanceM)).toBe(1);
  expect(lineProgressAt(r, m, r.distanceM / 2)).toBeCloseTo(0.5, 6);
});

test('interpolates inside a segment', () => {
  const m = mercatorCumulative(r.coords);
  const d = (r.cumDistM[3] + r.cumDistM[4]) / 2;
  expect(lineProgressAt(r, m, d)).toBeCloseTo(0.35, 6);
});

test('uses Mercator length (what line-progress measures), not metres: north-south route', () => {
  // Észak felé 47° → 49°: a Mercator-hossz északon „nyúlik”, így a méterbeli felezőpont Mercatorban 0.5 alatt van
  const north: LngLat[] = Array.from({ length: 201 }, (_, i) => [19, 47 + i * 0.01]);
  const rn = buildRoute(north, 60, []);
  const p = lineProgressAt(rn, mercatorCumulative(rn.coords), rn.distanceM / 2);
  expect(p).toBeLessThan(0.5);
  expect(p).toBeGreaterThan(0.49);
});

test('clamps outside the route', () => {
  const m = mercatorCumulative(r.coords);
  expect(lineProgressAt(r, m, -5)).toBe(0);
  expect(lineProgressAt(r, m, r.distanceM + 50)).toBe(1);
});
