import fixture from './__fixtures__/valhalla-bicycle.json';
import { rejection } from '../testUtils';
import { buildRoute, decodePolyline, getRoute, parseValhalla, RouteError } from './route';
import { HttpError } from './http';

test('decodes the reference polyline (precision 5) as [lng, lat]', () => {
  const pts = decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@', 5);
  expect(pts).toEqual([
    [-120.2, 38.5],
    [-120.95, 40.7],
    [-126.453, 43.252],
  ]);
});

test('buildRoute computes cumulative distances, step distances and bbox', () => {
  const r = buildRoute(
    [[19, 47.5], [19, 47.51], [19.01, 47.51]],
    120,
    [
      { type: 1, instruction: 'Indulás', streetNames: [], beginIndex: 0 },
      { type: 10, instruction: 'Jobbra', streetNames: ['A utca'], beginIndex: 1 },
      { type: 4, instruction: 'Cél', streetNames: [], beginIndex: 2 },
    ],
  );
  expect(r.cumDistM[0]).toBe(0);
  expect(r.cumDistM[1]).toBeCloseTo(1112, 0);
  expect(r.distanceM).toBe(r.cumDistM[2]);
  expect(r.steps[1].beginDistM).toBe(r.cumDistM[1]);
  expect(r.bbox).toEqual([19, 47.5, 19.01, 47.51]);
  expect(r.durationS).toBe(120);
});

test('parses a real Valhalla response', () => {
  const r = parseValhalla(fixture);
  expect(r.coords.length).toBeGreaterThan(50);
  // Első pont a Clark Ádám tér környékén, [lng, lat] sorrendben
  expect(r.coords[0][0]).toBeCloseTo(19.04, 2);
  expect(r.coords[0][1]).toBeCloseTo(47.498, 2);
  expect(r.distanceM).toBeGreaterThan(1200);
  expect(r.distanceM).toBeLessThan(2500);
  expect(r.steps.length).toBe(fixture.trip.legs[0].maneuvers.length);
  expect(r.steps[r.steps.length - 1].beginIndex).toBe(r.coords.length - 1);
  expect(r.steps.every((s) => typeof s.instruction === 'string')).toBe(true);
});

test('getRoute posts the Valhalla request and parses it', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => fixture, text: async () => '' }) as Response);
  const r = await getRoute([19.0402, 47.4979], [19.046, 47.507], 'bicycle', undefined, { fetchImpl });
  expect(r.steps.length).toBeGreaterThan(0);
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://valhalla1.openstreetmap.de/route');
  const body = JSON.parse(init.body as string);
  expect(body).toMatchObject({
    locations: [{ lon: 19.0402, lat: 47.4979 }, { lon: 19.046, lat: 47.507 }],
    costing: 'bicycle',
    language: 'en-US',
    units: 'kilometers',
  });
});

test('Valhalla 400 maps to no-route', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => '{"error_code":442}' }) as Response);
  const err = await rejection<RouteError>(getRoute([0, 0], [1, 1], 'auto', undefined, { fetchImpl }));
  expect(err).toBeInstanceOf(RouteError);
  expect(err.kind).toBe('no-route');
});

test('network and rate limit errors keep their kind', async () => {
  const net = jest.fn(async () => { throw new HttpError('network'); });
  expect((await rejection<RouteError>(getRoute([0, 0], [1, 1], 'auto', undefined, { fetchImpl: net }))).kind).toBe('network');
  const rl = jest.fn(async () => ({ ok: false, status: 429, json: async () => ({}), text: async () => '' }) as Response);
  const err = await rejection<RouteError>(getRoute([0, 0], [1, 1], 'auto', undefined, { fetchImpl: rl, sleep: async () => {} }));
  expect(err.kind).toBe('rate-limited');
});
