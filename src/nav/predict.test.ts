import { buildRoute } from '../services/route';
import { haversineM } from './geo';
import { offsetPoint, pointAlong, predictPos } from './predict';

// Kelet felé, majd észak felé forduló útvonal
const route = buildRoute([[19, 47.5], [19.01, 47.5], [19.01, 47.51]], 600, []);
const leg1 = route.cumDistM[1];

test('pointAlong interpolates on the route and clamps to its ends', () => {
  const mid = pointAlong(route, leg1 / 2);
  expect(mid[0]).toBeCloseTo(19.005, 6);
  expect(mid[1]).toBeCloseTo(47.5, 6);
  expect(pointAlong(route, -5)).toEqual(route.coords[0]);
  expect(pointAlong(route, route.distanceM + 100)).toEqual(route.coords[2]);
});

test('offsetPoint moves the given distance in the given direction', () => {
  const p = offsetPoint([19, 47.5], 90, 100);
  expect(haversineM([19, 47.5], p)).toBeCloseTo(100, 0);
  expect(p[1]).toBeCloseTo(47.5, 6);
  expect(offsetPoint([19, 47.5], 0, 100)[1]).toBeGreaterThan(47.5);
});

test('on route the prediction follows the road around the corner', () => {
  const p = predictPos({ pos: route.coords[0], speedMps: 25, heading: 90, onRoute: { route, distAlongM: leg1 - 10 }, leadS: 1.2 });
  expect(p[0]).toBeCloseTo(19.01, 6); // a kanyar után már északra halad
  expect(p[1]).toBeGreaterThan(47.5);
  expect(haversineM(route.coords[1], p)).toBeCloseTo(20, 0);
});

test('on route the prediction stops at the destination', () => {
  const p = predictPos({ pos: route.coords[2], speedMps: 25, heading: 0, onRoute: { route, distAlongM: route.distanceM - 5 }, leadS: 1.2 });
  expect(p).toEqual(route.coords[2]);
});

test('off route it extrapolates along the heading', () => {
  const p = predictPos({ pos: [19, 47.5], speedMps: 20, heading: 90, onRoute: null, leadS: 1 });
  expect(haversineM([19, 47.5], p)).toBeCloseTo(20, 0);
  expect(p[0]).toBeGreaterThan(19);
});

test('no prediction when slow or without heading', () => {
  expect(predictPos({ pos: [19, 47.5], speedMps: 1, heading: 90, onRoute: null, leadS: 1 })).toEqual([19, 47.5]);
  expect(predictPos({ pos: [19, 47.5], speedMps: null, heading: 90, onRoute: null, leadS: 1 })).toEqual([19, 47.5]);
  expect(predictPos({ pos: [19, 47.5], speedMps: 20, heading: null, onRoute: null, leadS: 1 })).toEqual([19, 47.5]);
});
