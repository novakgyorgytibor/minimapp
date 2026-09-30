import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { buildMasks } from './corridor';
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
