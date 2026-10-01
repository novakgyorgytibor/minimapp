import type { LngLat } from '../types';
import { isStill, pushFix, STILL_WINDOW_MS, type RawFix } from './stillness';

const M_PER_DEG_LAT = 111_320;
const at = (northM: number): LngLat => [19.04, 47.5 + northM / M_PER_DEG_LAT];
const series = (offsetsM: number[], accuracyM: number | null = 10): RawFix[] =>
  offsetsM.reduce<RawFix[]>((h, m, i) => pushFix(h, { pos: at(m), t: i * 1000, accuracyM }), []);

test('jitter around one point is still', () => {
  expect(isStill(series([0, 2, -1, 3, 1, -2]))).toBe(true);
});

test('walking (1.4 m/s) is not still, even with poor accuracy', () => {
  const walk = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => i * 1.4);
  expect(isStill(series(walk, 5))).toBe(false);
  expect(isStill(series(walk, 40))).toBe(false);
});

test('driving is not still', () => {
  expect(isStill(series([0, 10, 20, 30, 40, 50]))).toBe(false);
});

test('larger wander is tolerated when accuracy is poor, but capped', () => {
  expect(isStill(series([0, 4, -3, 5, 2, -2], 16))).toBe(true);
  expect(isStill(series([0, 4, -3, 5, 2, -2], 5))).toBe(false);
  expect(isStill(series([0, 10, -10, 10, 0, -10], 100))).toBe(false);
});

test('too few or too short history is not judged still', () => {
  expect(isStill(series([0, 0]))).toBe(false);
  const h: RawFix[] = [0, 100, 200, 300].map((t) => ({ pos: at(0), t, accuracyM: 5 }));
  expect(isStill(h)).toBe(false);
});

test('pushFix keeps only the window', () => {
  const h = series([0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  expect(h[h.length - 1].t - h[0].t).toBeLessThanOrEqual(STILL_WINDOW_MS);
});
