import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { doneGeometry } from './doneGeometry';

const coords: LngLat[] = Array.from({ length: 41 }, (_, i) => [19 + i * 0.001, 47.5]); // ~3 km
const route = buildRoute(coords, 600, []);

test('coarse part ends on the 200 m grid, tail runs exactly to the travelled distance', () => {
  const d = 530;
  const { coarse, tail } = doneGeometry(route, d, 200);
  const end = (l: LngLat[]) => l[l.length - 1];
  // a durva rész 400 m-nél ér véget, a vége pontosan ott kezdődik
  expect(coarse[0]).toEqual(coords[0]);
  expect(end(coarse)).toEqual(tail[0]);
  // a vége pontosan d-nél: ~530 m keletre a kezdőponttól (0.001° lon ≈ 75.12 m itt)
  expect((end(tail)[0] - 19) * 75_120).toBeCloseTo(530, -1);
});

test('coarse only changes every 200 m (same array reference is not required, but same content)', () => {
  const a = doneGeometry(route, 410, 200).coarse;
  const b = doneGeometry(route, 590, 200).coarse;
  expect(b).toEqual(a);
});

test('nothing travelled yet → empty; before the first 200 m only the tail', () => {
  expect(doneGeometry(route, 0, 200)).toEqual({ coarse: [], tail: [] });
  const g = doneGeometry(route, 120, 200);
  expect(g.coarse).toEqual([]);
  expect(g.tail[0]).toEqual(coords[0]);
});
