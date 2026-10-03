import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { offsetPoint } from './predict';
import { camerasOnRoute, newerCameraData, nextCamera, parseCameras, warnDistanceM, type Camera } from './speedCameras';

const M_PER_DEG_LAT = 111_195;
const start: LngLat = [19, 47.5];
// Kelet felé haladunk; a kamerák a pozíciótól keletre / máshol
const east = (m: number): LngLat => offsetPoint(start, 90, m);
const cam = (pos: LngLat, dir: number | null = null, maxspeed: number | null = 50): Camera => ({ pos, maxspeed, dir });

describe('parseCameras', () => {
  test('reads the compact export and drops broken rows', () => {
    const json = JSON.stringify({ cameras: [[19.1, 47.5, 50, 90], [19.2, 47.6, null, null], [19.3], ['x', 47, 1, 2], null] });
    expect(parseCameras(json)).toEqual([
      { pos: [19.1, 47.5], maxspeed: 50, dir: 90 },
      { pos: [19.2, 47.6], maxspeed: null, dir: null },
    ]);
  });

  test('garbage → empty list', () => {
    expect(parseCameras('nope')).toEqual([]);
    expect(parseCameras(null)).toEqual([]);
    expect(parseCameras('{"cameras": 3}')).toEqual([]);
  });
});

test('warnDistanceM: ~20 s ahead, at least 300 m, at most 800 m', () => {
  expect(warnDistanceM(10)).toBe(300);
  expect(warnDistanceM(25)).toBe(500);
  expect(warnDistanceM(40)).toBe(800);
});

describe('nextCamera without a route (straight ahead in the travel direction)', () => {
  const base = { pos: start, heading: 90, speedMps: 20 };

  test('a camera ahead within the warning distance', () => {
    const r = nextCamera({ ...base, cameras: [cam(east(250))] });
    expect(r?.distM).toBeCloseTo(250, -1);
  });

  test('too far, behind, or off to the side → nothing', () => {
    expect(nextCamera({ ...base, cameras: [cam(east(600))] })).toBeNull();
    expect(nextCamera({ ...base, cameras: [cam(offsetPoint(start, 270, 100))] })).toBeNull();
    expect(nextCamera({ ...base, cameras: [cam(offsetPoint(start, 0, 200))] })).toBeNull();
  });

  test('a camera measuring the opposite direction is ignored; unknown direction counts', () => {
    expect(nextCamera({ ...base, cameras: [cam(east(200), 270)] })).toBeNull();
    expect(nextCamera({ ...base, cameras: [cam(east(200), 100)] })).not.toBeNull();
    expect(nextCamera({ ...base, cameras: [cam(east(200), null)] })).not.toBeNull();
  });

  test('the nearest of several', () => {
    const r = nextCamera({ ...base, cameras: [cam(east(280), null, 70), cam(east(120), null, 50)] });
    expect(r?.camera.maxspeed).toBe(50);
  });

  test('no heading → nothing (direction unknown)', () => {
    expect(nextCamera({ ...base, heading: null, cameras: [cam(east(200))] })).toBeNull();
  });
});

describe('on a route (distance along the route)', () => {
  // Kelet ~750 m, majd észak
  const corner = offsetPoint(start, 90, 750);
  const route = buildRoute([start, corner, offsetPoint(corner, 0, 750)], 100, []);
  const cams = [
    cam(offsetPoint(corner, 0, 200)), // a sarok után északra, az útvonalon
    cam(offsetPoint(east(300), 0, 60)), // 60 m-re az útvonaltól (párhuzamos utca) → nem az útvonalon
    cam(east(500), 270), // az útvonalon, de a szemközti irányt méri
  ];

  test('only cameras on the route, measuring our direction, ordered along it', () => {
    const on = camerasOnRoute(cams, route);
    expect(on).toHaveLength(1);
    expect(on[0].alongM).toBeCloseTo(950, -1);
  });

  test('the next camera along the route, around the corner too', () => {
    const on = camerasOnRoute(cams, route);
    const r = nextCamera({ pos: east(600), heading: 90, speedMps: 20, cameras: cams, onRoute: { cameras: on, distAlongM: 600 } });
    // 350 m az útvonal mentén (légvonalban kevesebb, és nem is a menetirányban van)
    expect(r?.distM).toBeCloseTo(350, -1);
    // elhaladva már nincs
    expect(nextCamera({ pos: east(600), heading: 0, speedMps: 20, cameras: cams, onRoute: { cameras: on, distAlongM: 960 } })).toBeNull();
  });

  test('far along the route → not yet', () => {
    const on = camerasOnRoute(cams, route);
    expect(nextCamera({ pos: start, heading: 90, speedMps: 20, cameras: cams, onRoute: { cameras: on, distAlongM: 0 } })).toBeNull();
  });
});

test('lateral offset helper sanity: 60 m north is 60 m', () => {
  expect((offsetPoint(start, 0, 60)[1] - 47.5) * M_PER_DEG_LAT).toBeCloseTo(60, 0);
});

test('newerCameraData picks the later export, never an empty one', () => {
  const a = { updated: '2026-09-01', cameras: [cam(east(1))] };
  const b = { updated: '2026-10-01', cameras: [cam(east(2))] };
  expect(newerCameraData(a, b)).toBe(b);
  expect(newerCameraData(b, a)).toBe(b);
  expect(newerCameraData(a, { updated: '2027-01-01', cameras: [] })).toBe(a);
  expect(newerCameraData(a, null)).toBe(a);
});
