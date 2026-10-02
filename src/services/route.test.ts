import fixture from './__fixtures__/valhalla-osrm-auto.json';
import { rejection } from '../testUtils';
import { buildRoute, decodePolyline, getRoute, needsTollFree, parseOsrm, RouteError, sameRoute } from './route';
import { HttpError } from './http';

test('reroute: the travel heading goes to Valhalla so the new route starts the way we are going', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => fixture, text: async () => '' }) as Response);
  await getRoute([19.0402, 47.4979], [19.046, 47.507], 'auto', undefined, { fetchImpl }, 'hu', 'fast', 181.6);
  const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  expect(body.locations[0]).toEqual({ lon: 19.0402, lat: 47.4979, heading: 182, heading_tolerance: 45 });
  expect(body.locations[1]).toEqual({ lon: 19.046, lat: 47.507 });
});

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
      { kind: 'depart', instruction: 'Start', streetNames: [], beginIndex: 0 },
      { kind: 'turn', modifier: 'right', instruction: 'Turn right', streetNames: ['A utca'], beginIndex: 1 },
      { kind: 'arrive', instruction: 'Arrive', streetNames: [], beginIndex: 2 },
    ],
  );
  expect(r.cumDistM[0]).toBe(0);
  expect(r.cumDistM[1]).toBeCloseTo(1112, 0);
  expect(r.distanceM).toBe(r.cumDistM[2]);
  expect(r.steps[1].beginDistM).toBe(r.cumDistM[1]);
  expect(r.bbox).toEqual([19, 47.5, 19.01, 47.51]);
  expect(r.durationS).toBe(120);
});

const osrmSteps = fixture.routes[0].legs[0].steps;

test('parses a real Valhalla OSRM-format response', () => {
  const r = parseOsrm(fixture);
  expect(r.steps).toHaveLength(osrmSteps.length);
  // Vincellér utca környékéről indul, [lng, lat] sorrendben
  expect(r.coords[0][0]).toBeCloseTo(19.034, 2);
  expect(r.coords[0][1]).toBeCloseTo(47.474, 2);
  expect(r.durationS).toBeCloseTo(fixture.routes[0].duration, 3);
  // a lépésgeometriák összefűzése kb. a teljes hosszt adja
  expect(r.distanceM).toBeGreaterThan(fixture.routes[0].distance * 0.97);
  expect(r.distanceM).toBeLessThan(fixture.routes[0].distance * 1.03);
  // minden lépés a saját manőverpontján kezdődik
  r.steps.forEach((st, i) => {
    const loc = osrmSteps[i].maneuver.location;
    expect(r.coords[st.beginIndex][0]).toBeCloseTo(loc[0], 4);
    expect(r.coords[st.beginIndex][1]).toBeCloseTo(loc[1], 4);
  });
  expect(r.steps[0].kind).toBe('depart');
  expect(r.steps[r.steps.length - 1].kind).toBe('arrive');
});

test('keeps signs, exit numbers, refs and lanes', () => {
  const r = parseOsrm(fixture);
  const exit = r.steps.find((s) => s.kind === 'off ramp')!;
  expect(exit).toMatchObject({ modifier: 'slight right', exitNumber: '16', ref: 'M7', destinations: 'M0 gyűrű ring, Érd észak' });
  expect(exit.lanes).toEqual([
    { indications: ['straight'], valid: false },
    { indications: ['straight'], valid: false },
    { indications: ['slight right'], valid: true },
  ]);
  const plain = r.steps.find((s) => s.kind === 'turn')!;
  expect(plain.lanes ?? []).toEqual([]);
  expect(plain.streetNames.length).toBe(1);
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
    format: 'osrm',
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

test('Hungarian instructions are requested when the app language is Hungarian', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => fixture, text: async () => '' }) as Response);
  await getRoute([19.0402, 47.4979], [19.046, 47.507], 'auto', undefined, { fetchImpl }, 'hu');
  const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(init.body as string).language).toBe('hu-HU');
});

test('shortest route is requested with costing_options', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => fixture, text: async () => '' }) as Response);
  await getRoute([19.0402, 47.4979], [19.046, 47.507], 'auto', undefined, { fetchImpl }, 'en', 'short');
  const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(init.body as string).costing_options).toEqual({ auto: { shortest: true } });
});

test('toll-free route is requested with use_tolls: 0', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => fixture, text: async () => '' }) as Response);
  await getRoute([19.0402, 47.4979], [19.046, 47.507], 'auto', undefined, { fetchImpl }, 'en', 'notoll');
  const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(init.body as string).costing_options).toEqual({ auto: { use_tolls: 0 } });
});

test('needsTollFree: only when no toll-free option is offered', () => {
  const free = buildRoute([[19, 47.5], [19.01, 47.5]], 600, []);
  const toll = { ...free, hasToll: true };
  expect(needsTollFree(toll, null)).toBe(true);
  expect(needsTollFree(toll, toll)).toBe(true);
  expect(needsTollFree(toll, free)).toBe(false);
  expect(needsTollFree(free, toll)).toBe(false);
  expect(needsTollFree(free, null)).toBe(false);
});

test('fastest route has no costing_options', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => fixture, text: async () => '' }) as Response);
  await getRoute([19.0402, 47.4979], [19.046, 47.507], 'auto', undefined, { fetchImpl });
  const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(JSON.parse(init.body as string).costing_options).toBeUndefined();
});

test('sameRoute: equal within 1% distance and duration', () => {
  const a = buildRoute([[19, 47.5], [19.01, 47.5]], 600, []);
  const b = { ...a, distanceM: a.distanceM * 1.005, durationS: 603 };
  const c = { ...a, distanceM: a.distanceM * 0.9, durationS: 700 };
  expect(sameRoute(a, b)).toBe(true);
  expect(sameRoute(a, c)).toBe(false);
});

test('detects toll roads from intersection classes', () => {
  expect(parseOsrm(fixture).hasToll).toBe(true); // M7 / M0: útdíjas autópálya
  const noToll = JSON.parse(JSON.stringify(fixture));
  for (const st of noToll.routes[0].legs[0].steps)
    for (const it of st.intersections ?? []) it.classes = (it.classes ?? []).filter((c: string) => c !== 'toll');
  expect(parseOsrm(noToll).hasToll).toBe(false);
});
