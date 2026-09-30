import { rejection } from '../testUtils';
import { getSpeedLimit, isSpeeding, pushTrail, shouldQuerySpeedLimit, speedLimitVisible } from './speedLimit';

const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as Response;
const trail: [number, number][] = [[19.029913, 47.483081], [19.030375, 47.482902], [19.0313, 47.4825]];

test('asks Valhalla trace_attributes and returns the last edge speed limit', async () => {
  const fetchImpl = jest.fn(async () => json({ edges: [{ speed_limit: 30 }, { speed_limit: 40 }] }));
  await expect(getSpeedLimit(trail, undefined, { fetchImpl })).resolves.toBe(40);
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe('https://valhalla1.openstreetmap.de/trace_attributes');
  const body = JSON.parse(init.body as string);
  expect(body.shape[0]).toEqual({ lat: 47.483081, lon: 19.029913 });
  expect(body).toMatchObject({ costing: 'auto', shape_match: 'map_snap' });
  expect(body.filters.attributes).toContain('edge.speed_limit');
});

test('unknown limit (missing or 0) → null', async () => {
  await expect(getSpeedLimit(trail, undefined, { fetchImpl: jest.fn(async () => json({ edges: [{ speed_limit: 0 }] })) })).resolves.toBeNull();
  await expect(getSpeedLimit(trail, undefined, { fetchImpl: jest.fn(async () => json({ edges: [{}] })) })).resolves.toBeNull();
  await expect(getSpeedLimit(trail, undefined, { fetchImpl: jest.fn(async () => json({})) })).resolves.toBeNull();
});

test('too short trail does not hit the network', async () => {
  const fetchImpl = jest.fn();
  await expect(getSpeedLimit([trail[0]], undefined, { fetchImpl })).resolves.toBeNull();
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('server error propagates (caller keeps the last value)', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({}), text: async () => '' }) as Response);
  await expect(rejection(getSpeedLimit(trail, undefined, { fetchImpl }))).resolves.toBeDefined();
});

describe('pushTrail', () => {
  const M = 1 / 111_195;
  test('keeps points at least 10 m apart, at most 6', () => {
    let t: [number, number][] = [];
    for (let i = 0; i < 20; i++) t = pushTrail(t, [19, 47.5 + i * 12 * M]);
    expect(t).toHaveLength(6);
    expect(pushTrail(t, [19, t[5][1] + 3 * M])).toBe(t); // 3 m: nem kerül be
  });
});

describe('shouldQuerySpeedLimit', () => {
  const M = 1 / 111_195;
  test('first query right away', () => {
    expect(shouldQuerySpeedLimit(null, [19, 47.5], 0)).toBe(true);
  });
  test('again after 10 s or 150 m', () => {
    const last = { at: 0, pos: [19, 47.5] as [number, number] };
    expect(shouldQuerySpeedLimit(last, [19, 47.5 + 50 * M], 5_000)).toBe(false);
    expect(shouldQuerySpeedLimit(last, [19, 47.5 + 50 * M], 10_000)).toBe(true);
    expect(shouldQuerySpeedLimit(last, [19, 47.5 + 160 * M], 3_000)).toBe(true);
  });
});

describe('speedLimitVisible', () => {
  test('drive mode while navigating, or rolling faster than 5 km/h', () => {
    expect(speedLimitVisible({ mode: 'auto', navigating: true, speedMps: 0 })).toBe(true);
    expect(speedLimitVisible({ mode: 'auto', navigating: false, speedMps: 6 / 3.6 })).toBe(true);
    expect(speedLimitVisible({ mode: 'auto', navigating: false, speedMps: 4 / 3.6 })).toBe(false);
    expect(speedLimitVisible({ mode: 'bicycle', navigating: true, speedMps: 20 / 3.6 })).toBe(false);
    expect(speedLimitVisible({ mode: 'auto', navigating: false, speedMps: null })).toBe(false);
  });
});

describe('isSpeeding', () => {
  test('only above the limit (as the speed readout rounds it)', () => {
    expect(isSpeeding(50 / 3.6, 50)).toBe(false);
    expect(isSpeeding(50.6 / 3.6, 50)).toBe(true); // kijelzőn 51
    expect(isSpeeding(50.4 / 3.6, 50)).toBe(false); // kijelzőn 50
    expect(isSpeeding(null, 50)).toBe(false);
    expect(isSpeeding(80 / 3.6, null)).toBe(false);
  });
});
