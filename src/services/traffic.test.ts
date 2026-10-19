import { config } from '../config';
import { haversineM } from '../nav/geo';
import { rejection } from '../testUtils';
import type { LngLat } from '../types';
import type { HttpError } from './http';
import { buildRoute } from './route';
import { altIsFaster, getTrafficTimeS, supportingPoints, trafficFactor } from './traffic';

// Kelet felé ~7.5 km, 10 m-enként egy pont
const coords: LngLat[] = Array.from({ length: 751 }, (_, i) => [19 + i * 0.000132, 47.5]);
const route = buildRoute(coords, 600, []);

describe('supportingPoints', () => {
  test('from the given distance to the end, about every trafficSpacingM', () => {
    const pts = supportingPoints(route, 1000);
    expect(haversineM(pts[0], coords[0])).toBeCloseTo(1000, -1);
    expect(pts[pts.length - 1]).toEqual(coords[coords.length - 1]);
    for (let i = 1; i < pts.length - 1; i++) {
      const gap = haversineM(pts[i - 1], pts[i]);
      expect(gap).toBeGreaterThanOrEqual(config.trafficSpacingM - 1);
      expect(gap).toBeLessThan(config.trafficSpacingM + 15);
    }
  });

  test('long routes are capped at about maxPoints', () => {
    expect(supportingPoints(route, 0, 20).length).toBeLessThanOrEqual(22);
  });

  test('at the very end: just the endpoint pair', () => {
    expect(supportingPoints(route, route.distanceM + 50)).toEqual([coords[coords.length - 1], coords[coords.length - 1]]);
  });
});

describe('getTrafficTimeS', () => {
  const ok = (json: unknown) => jest.fn(async () => ({ ok: true, status: 200, json: async () => json, text: async () => '' }) as Response);

  test('POSTs the points (lat/lon) for reconstruction with traffic, returns the travel time', async () => {
    const fetchImpl = ok({ routes: [{ summary: { travelTimeInSeconds: 734, lengthInMeters: 1350 } }] });
    const pts: LngLat[] = [[19, 47.5], [19.01, 47.51]];
    await expect(getTrafficTimeS(pts, 1340, undefined, { fetchImpl })).resolves.toBe(734);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url.startsWith(`${config.tomtomRoutingUrl}/47.5,19:47.51,19.01/json?`)).toBe(true);
    const q = new URL(url).searchParams;
    expect(q.get('traffic')).toBe('true');
    expect(q.get('travelMode')).toBe('car');
    expect(q.get('reconstructionMode')).toBe('track');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      supportingPoints: [{ latitude: 47.5, longitude: 19 }, { latitude: 47.51, longitude: 19.01 }],
    });
  });

  test('quota used up (429): no retry, rejects', async () => {
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => '' }) as Response);
    const err = await rejection<HttpError>(getTrafficTimeS([[19, 47.5], [19.01, 47.5]], 750, undefined, { fetchImpl }));
    expect(err.kind).toBe('rate-limited');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('no route in the answer → rejects', async () => {
    await expect(getTrafficTimeS([[19, 47.5], [19.01, 47.5]], 750, undefined, { fetchImpl: ok({ routes: [] }) })).rejects.toThrow();
  });

  test('a detour in the reconstruction (route much longer than ours) → rejects', async () => {
    // a budaörsi teszten: 50.6 km helyett 53.8 km, mert a kezdőpontot máshová illesztette
    const fetchImpl = ok({ routes: [{ summary: { travelTimeInSeconds: 3112, lengthInMeters: 53_836 } }] });
    await expect(getTrafficTimeS([[19, 47.5], [19.01, 47.5]], 50_606, undefined, { fetchImpl })).rejects.toThrow('differs');
    // 1% eltérés belefér
    const near = ok({ routes: [{ summary: { travelTimeInSeconds: 1361, lengthInMeters: 22_394 } }] });
    await expect(getTrafficTimeS([[19, 47.5], [19.01, 47.5]], 22_430, undefined, { fetchImpl: near })).resolves.toBe(1361);
  });
});

test('trafficFactor: ratio, clamped; null without data', () => {
  expect(trafficFactor(900, 600)).toBeCloseTo(1.5);
  expect(trafficFactor(100, 600)).toBe(config.trafficFactorMin);
  expect(trafficFactor(60_000, 600)).toBe(config.trafficFactorMax);
  expect(trafficFactor(900, 0)).toBeNull();
  expect(trafficFactor(0, 600)).toBeNull();
});

test('altIsFaster needs a real difference (a minute and a few percent)', () => {
  expect(altIsFaster(1200, 1100)).toBe(true);
  expect(altIsFaster(1200, 1170)).toBe(false); // fél perc
  expect(altIsFaster(10_000, 9_900)).toBe(false); // 100 s, de csak 1%
  expect(altIsFaster(1100, 1200)).toBe(false);
});
