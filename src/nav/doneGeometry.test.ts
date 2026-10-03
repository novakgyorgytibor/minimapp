import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { aheadGeometry, doneGeometry, progressTails } from './doneGeometry';

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

describe('aheadGeometry', () => {
  test('tail runs from the travelled distance to the next 200 m grid point, coarse from there to the end', () => {
    const { coarse, tail } = aheadGeometry(route, 530, 200);
    const end = (l: LngLat[]) => l[l.length - 1];
    expect((tail[0][0] - 19) * 75_120).toBeCloseTo(530, -1);
    expect(end(tail)).toEqual(coarse[0]);
    expect((coarse[0][0] - 19) * 75_120).toBeCloseTo(600, -1);
    expect(end(coarse)).toEqual(coords[coords.length - 1]);
  });

  test('coarse only changes every 200 m', () => {
    expect(aheadGeometry(route, 410, 200).coarse).toEqual(aheadGeometry(route, 590, 200).coarse);
  });

  test('on a grid point there is no tail; at the end nothing is ahead', () => {
    expect(aheadGeometry(route, 400, 200).tail).toEqual([]);
    expect(aheadGeometry(route, route.distanceM, 200)).toEqual({ coarse: [], tail: [] });
  });
});

describe('progressTails', () => {
  const x = (c: LngLat) => (c[0] - 19) * 75_120;
  const end = (l: LngLat[]) => l[l.length - 1];

  test('the done tail starts one grid step before the coarse end, the ahead tail ends one step after the coarse start', () => {
    const t = progressTails(route, 530, 200);
    expect(t.grid).toBe(400);
    expect(t.gridAhead).toBe(600);
    expect(x(t.doneTail[0])).toBeCloseTo(200, -1);
    expect(x(end(t.doneTail))).toBeCloseTo(530, -1);
    expect(x(t.aheadTail[0])).toBeCloseTo(530, -1);
    expect(x(end(t.aheadTail))).toBeCloseTo(800, -1);
  });

  test('no gap when the grid steps: old coarse + new tail and new coarse + old tail both cover everything', () => {
    const before = progressTails(route, 399, 200);
    const after = progressTails(route, 401, 200);
    // megtett rész: régi durva (0..200) + új vég (200..401); új durva (0..400) + régi vég (0..399)
    expect(x(after.doneTail[0])).toBeLessThanOrEqual(before.grid + 1);
    expect(x(before.doneTail[0])).toBeLessThanOrEqual(1);
    // előttünk: régi durva (400..) + új vég (401..800); új durva (600..) + régi vég (399..600)
    expect(x(end(before.aheadTail))).toBeGreaterThanOrEqual(after.gridAhead - 1);
  });

  test('start and end of the route', () => {
    expect(progressTails(route, 0, 200).doneTail).toEqual([]);
    expect(progressTails(route, route.distanceM, 200).aheadTail).toEqual([]);
    expect(end(progressTails(route, route.distanceM - 50, 200).aheadTail)).toEqual(coords[coords.length - 1]);
  });
});
