import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { buildMasks, fullMasks, maskBase } from './corridor';
import type { LngLat } from '../types';

const RADII = [50, 100, 150, 200, 250, 300];
const M_PER_DEG_LAT = 111_195;
const north = ([lng, lat]: LngLat, m: number): LngLat => [lng, lat + m / M_PER_DEG_LAT];

// kb. 750 m keletre tartó egyenes Budapesten
const line: LngLat[] = [[19.0, 47.5], [19.005, 47.5], [19.01, 47.5]];
const inside = (masks: ReturnType<typeof buildMasks>, p: LngLat) => masks.map((m) => booleanPointInPolygon(p, m));

test('one mask per radius', () => {
  const masks = buildMasks({ type: 'LineString', coords: line }, RADII);
  expect(masks).toHaveLength(6);
  expect(masks.map((m) => m.properties.radiusM)).toEqual(RADII);
});

test('the route itself is never masked', () => {
  const masks = buildMasks({ type: 'LineString', coords: line }, RADII);
  expect(inside(masks, [19.005, 47.5])).toEqual([false, false, false, false, false, false]);
});

test('a point 175 m off the route is covered only by the 50/100/150 m masks', () => {
  const masks = buildMasks({ type: 'LineString', coords: line }, RADII);
  expect(inside(masks, north([19.005, 47.5], 175))).toEqual([true, true, true, false, false, false]);
});

test('a far point is covered by every mask', () => {
  const masks = buildMasks({ type: 'LineString', coords: line }, RADII);
  expect(inside(masks, [19.2, 47.7])).toEqual([true, true, true, true, true, true]);
});

test('point geometry yields circular holes', () => {
  const masks = buildMasks({ type: 'Point', coord: [19.0, 47.5] }, RADII);
  expect(inside(masks, [19.0, 47.5])).toEqual([false, false, false, false, false, false]);
  expect(inside(masks, north([19.0, 47.5], 120))).toEqual([true, true, false, false, false, false]);
});

test('area enclosed by a looping route stays masked (island)', () => {
  // kb. 1.5 km oldalú négyzet körbe
  const d = 0.02;
  const loop: LngLat[] = [[19, 47.5], [19 + d, 47.5], [19 + d, 47.5 + d * 0.7], [19, 47.5 + d * 0.7], [19, 47.5]];
  const masks = buildMasks({ type: 'LineString', coords: loop }, RADII);
  const center: LngLat = [19 + d / 2, 47.5 + d * 0.35];
  expect(inside(masks, center)).toEqual([true, true, true, true, true, true]);
});

test('long routes (20k points, ~300 km) build fast enough', () => {
  const coords: LngLat[] = [];
  // sűrű, enyhén kanyargó pálya – mint egy valós Valhalla shape
  for (let i = 0; i < 20_000; i++) coords.push([16 + i * 0.0002, 47 + 0.05 * Math.sin(i / 2000)]);
  const t0 = Date.now();
  const masks = buildMasks({ type: 'LineString', coords }, RADII);
  expect(masks).toHaveLength(6);
  expect(Date.now() - t0).toBeLessThan(3000);
});

// 20k pontos véletlen bolyongás (~300 km), mint egy valós úthálózaton futó shape
function jaggedRoute(): LngLat[] {
  let seed = 42;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const coords: LngLat[] = [[16, 47]];
  for (let i = 1; i < 20_000; i++) {
    const [lng, lat] = coords[i - 1];
    coords.push([lng + 0.0002 + (rand() - 0.5) * 0.0002, lat + (rand() - 0.5) * 0.0003]);
  }
  return coords;
}
const pointCount = (f: ReturnType<typeof maskBase>) =>
  f.geometry.type === 'LineString'
    ? f.geometry.coordinates.length
    : f.geometry.type === 'MultiLineString'
      ? f.geometry.coordinates.reduce((n, l) => n + l.length, 0)
      : 1;

test('clipping a long route to the view keeps only the visible part', () => {
  const coords = jaggedRoute();
  const mid = coords[10_000];
  const d = 0.003; // ~ 300 m-es ablak
  const base = maskBase({ type: 'LineString', coords }, { toleranceM: 1, clip: [mid[0] - d, mid[1] - d, mid[0] + d, mid[1] + d] });
  expect(pointCount(base)).toBeGreaterThan(1);
  expect(pointCount(base)).toBeLessThan(200);
});

test('route completely outside the clip → everything masked', () => {
  const masks = buildMasks({ type: 'LineString', coords: line }, RADII, { clip: [20, 48, 20.01, 48.01] });
  expect(inside(masks, [19.005, 47.5])).toEqual([true, true, true, true, true, true]);
});

test('simplification tolerance follows the largest radius', () => {
  const wiggle: LngLat[] = [[19, 47.5], [19.001, 47.5001], [19.002, 47.5]]; // ~11 m kitérés
  expect(pointCount(maskBase({ type: 'LineString', coords: wiggle }, { toleranceM: 3 }))).toBe(3);
  expect(pointCount(maskBase({ type: 'LineString', coords: wiggle }, { toleranceM: 20 }))).toBe(2);
});

test('clipped masks still keep the visible route unmasked', () => {
  const masks = buildMasks({ type: 'LineString', coords: line }, RADII, { clip: [19.004, 47.499, 19.006, 47.501] });
  expect(inside(masks, [19.005, 47.5])).toEqual([false, false, false, false, false, false]);
});

test('fullMasks blacks out everything (no position yet)', () => {
  const masks = fullMasks(RADII);
  expect(masks.map((m) => m.properties.radiusM)).toEqual(RADII);
  expect(inside(masks, [19.0, 47.5])).toEqual([true, true, true, true, true, true]);
});

test('multi-line corridor (selected + alternative route) keeps both unmasked', () => {
  const other: LngLat[] = [[19.0, 47.51], [19.005, 47.51], [19.01, 47.51]]; // ~1.1 km északra
  const masks = buildMasks({ type: 'MultiLineString', lines: [line, other] }, RADII);
  expect(inside(masks, [19.005, 47.5])).toEqual([false, false, false, false, false, false]);
  expect(inside(masks, [19.005, 47.51])).toEqual([false, false, false, false, false, false]);
  // a kettő között (≈550 m-re mindkettőtől) minden maszk takar
  expect(inside(masks, [19.005, 47.505])).toEqual([true, true, true, true, true, true]);
});
