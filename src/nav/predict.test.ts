import { buildRoute } from '../services/route';
import { haversineM } from './geo';
import { coastLeadS, offsetPoint, pointAlong, predictAlongM, predictPos, routeBearingAt, nextAlongTarget } from './predict';

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

test('predictAlongM leads by speed × time, clamps to the destination, and does not lead when slow', () => {
  expect(predictAlongM(route, 100, 20, 1.2)).toBeCloseTo(124, 6);
  expect(predictAlongM(route, route.distanceM - 5, 25, 1.2)).toBe(route.distanceM);
  expect(predictAlongM(route, 100, 0, 1.2)).toBe(100);
  expect(predictAlongM(route, 100, null, 1.2)).toBe(100);
});

test('coastLeadS: one glide ahead, plus one step per late fix', () => {
  expect(coastLeadS(0, 1200, 1100)).toBeCloseTo(1.2);
  expect(coastLeadS(1, 1200, 1100)).toBeCloseTo(2.3);
  expect(coastLeadS(2, 1200, 1100)).toBeCloseTo(3.4);
});

describe('routeBearingAt', () => {
  test('along a straight leg it is the direction of the leg', () => {
    expect(routeBearingAt(route, leg1 / 2, 10)).toBeCloseTo(90, 0);
    expect(routeBearingAt(route, leg1 + 200, 10)).toBeCloseTo(0, 0);
  });

  test('at the corner it is halfway, and it turns only within the window around it', () => {
    expect(routeBearingAt(route, leg1, 10)).toBeCloseTo(45, 0);
    expect(routeBearingAt(route, leg1 - 6, 10)).toBeCloseTo(90, 0);
    expect(routeBearingAt(route, leg1 + 6, 10)).toBeCloseTo(0, 0);
  });

  test('at the ends of the route it uses the first / last leg', () => {
    expect(routeBearingAt(route, 0, 10)).toBeCloseTo(90, 0);
    expect(routeBearingAt(route, route.distanceM, 10)).toBeCloseTo(0, 0);
  });
});

describe('nextAlongTarget', () => {
  const base = { speedMps: 30, leadS: 1.2, gain: 0.5, resetM: 300, maxM: 10_000 };

  test('on track: keeps going at the measured speed', () => {
    expect(nextAlongTarget({ ...base, fromM: 1000, measuredM: 1000 })).toBeCloseTo(1036);
  });

  test('GPS noise: only half of the deviation is applied', () => {
    expect(nextAlongTarget({ ...base, fromM: 1000, measuredM: 1006 })).toBeCloseTo(1039);
    expect(nextAlongTarget({ ...base, fromM: 1000, measuredM: 994 })).toBeCloseTo(1033);
  });

  test('a steady offset is closed step by step', () => {
    let from = 1000;
    let truth = 1020;
    for (let i = 0; i < 6; i++) {
      // a csúszás 1 s múlva tart ott, ahol a cél felé jár (cél 1,2 s-ra)
      const to = nextAlongTarget({ ...base, fromM: from, measuredM: truth });
      from += (to - from) / 1.2;
      truth += 30;
    }
    expect(Math.abs(truth - from)).toBeLessThan(2);
  });

  test('slow → the measured position; huge jump → no smoothing; clamped to the route', () => {
    expect(nextAlongTarget({ ...base, speedMps: 1, fromM: 1000, measuredM: 1004 })).toBe(1004);
    expect(nextAlongTarget({ ...base, fromM: 1000, measuredM: 2000 })).toBeCloseTo(2036);
    expect(nextAlongTarget({ ...base, fromM: 9990, measuredM: 9995 })).toBe(10_000);
  });
});
