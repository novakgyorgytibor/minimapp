import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { isRealManeuver, maneuverSegments, nextManeuverSegment } from './maneuverSegments';

// Kelet felé 21 pont, ~7.5 m lépésekkel (0.0001° lon 47.5°-on), összesen ~150 m
const coords: LngLat[] = Array.from({ length: 21 }, (_, i) => [19 + i * 0.0001, 47.5]);
const route = buildRoute(coords, 60, [
  { kind: 'depart', instruction: '', streetNames: [], beginIndex: 0 },
  { kind: 'new name', modifier: 'straight', instruction: '', streetNames: [], beginIndex: 5 },
  { kind: 'turn', modifier: 'right', instruction: '', streetNames: [], beginIndex: 10 },
  { kind: 'arrive', instruction: '', streetNames: [], beginIndex: 20 },
]);

test('only real maneuvers count', () => {
  expect(route.steps.map(isRealManeuver)).toEqual([false, false, true, false]);
  expect(isRealManeuver({ ...route.steps[1], kind: 'continue', modifier: 'uturn' })).toBe(true);
  expect(isRealManeuver({ ...route.steps[1], kind: 'fork', modifier: 'slight left' })).toBe(true);
  expect(isRealManeuver({ ...route.steps[1], kind: 'roundabout', modifier: undefined })).toBe(true);
});

test('one segment around the turn, ±30 m, following the route', () => {
  const fc = maneuverSegments(route, 30, 30);
  expect(fc.features).toHaveLength(1);
  const line = fc.features[0].geometry.coordinates as LngLat[];
  const turn = coords[10];
  // a kanyarpont benne van, és a szakasz kb. 60 m hosszú
  expect(line.some(([x, y]) => x === turn[0] && y === turn[1])).toBe(true);
  const lenDeg = line[line.length - 1][0] - line[0][0];
  expect(lenDeg * 75_120).toBeCloseTo(60, -1);
});

test('segments are clamped to the route ends', () => {
  const nearStart = buildRoute(coords, 60, [
    { kind: 'depart', instruction: '', streetNames: [], beginIndex: 0 },
    { kind: 'turn', modifier: 'left', instruction: '', streetNames: [], beginIndex: 1 },
    { kind: 'arrive', instruction: '', streetNames: [], beginIndex: 20 },
  ]);
  const line = maneuverSegments(nearStart, 30, 30).features[0].geometry.coordinates as LngLat[];
  expect(line[0]).toEqual(coords[0]);
});

describe('nextManeuverSegment', () => {
  test('only the given upcoming maneuver is highlighted', () => {
    const fc = nextManeuverSegment(route, 2, 30, 30);
    expect(fc.features).toHaveLength(1);
    expect(fc).toEqual({ type: 'FeatureCollection', features: [maneuverSegments(route, 30, 30).features[0]] });
  });
  test('nothing when the upcoming step is not a real maneuver (e.g. arrival or straight on)', () => {
    expect(nextManeuverSegment(route, 3, 30, 30).features).toEqual([]);
    expect(nextManeuverSegment(route, 1, 30, 30).features).toEqual([]);
  });
  test('out of range index → nothing', () => {
    expect(nextManeuverSegment(route, 99, 30, 30).features).toEqual([]);
  });
});
