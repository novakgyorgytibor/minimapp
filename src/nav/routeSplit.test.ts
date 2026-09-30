import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { doneBucketM, splitRoute } from './routeSplit';

const coords: LngLat[] = Array.from({ length: 11 }, (_, i) => [19 + i * 0.001, 47.5]); // ~750 m
const route = buildRoute(coords, 60, [
  { kind: 'depart', instruction: '', streetNames: [], beginIndex: 0 },
  { kind: 'arrive', instruction: '', streetNames: [], beginIndex: 10 },
]);

test('splits at the travelled distance: done ends where ahead starts', () => {
  const d = route.cumDistM[4] + 20;
  const { done, ahead } = splitRoute(route, d);
  expect(done[0]).toEqual(coords[0]);
  expect(ahead[ahead.length - 1]).toEqual(coords[10]);
  expect(done[done.length - 1]).toEqual(ahead[0]);
  expect(done[done.length - 1][0]).toBeGreaterThan(coords[4][0]);
  expect(done[done.length - 1][0]).toBeLessThan(coords[5][0]);
});

test('at the start nothing is done; at the end nothing is ahead', () => {
  expect(splitRoute(route, 0).done).toHaveLength(0);
  expect(splitRoute(route, 0).ahead).toEqual(coords);
  expect(splitRoute(route, route.distanceM + 5).ahead).toHaveLength(0);
});

test('doneBucketM rounds down to 10 m (limits re-rendering)', () => {
  expect(doneBucketM(0)).toBe(0);
  expect(doneBucketM(19.9)).toBe(10);
  expect(doneBucketM(20)).toBe(20);
});
