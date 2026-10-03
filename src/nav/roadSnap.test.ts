import { offsetPoint } from './predict';
import { featureLines, rollingPose, snapToRoads } from './roadSnap';
import { haversineM } from './geo';
import type { LngLat } from '../types';

const O: LngLat = [19.04, 47.5];
// Észak–déli út 10 m-re keletre, és egy kelet–nyugati keresztutca 8 m-re északra
const ns: LngLat[] = [offsetPoint(offsetPoint(O, 90, 10), 180, 200), offsetPoint(offsetPoint(O, 90, 10), 0, 200)];
const ew: LngLat[] = [offsetPoint(offsetPoint(O, 0, 8), 270, 200), offsetPoint(offsetPoint(O, 0, 8), 90, 200)];

test('északra haladva az észak–déli útra illeszt, észak felé nézve (a közelebbi keresztutcára nem)', () => {
  const s = snapToRoads(O, 5, [ns, ew])!;
  expect(s.distM).toBeCloseTo(10, 0);
  expect(s.bearing).toBeCloseTo(0, 0);
  expect(haversineM(s.pos, offsetPoint(O, 90, 10))).toBeLessThan(0.5);
});

test('délre haladva ugyanarra az útra, de dél felé nézve', () => {
  expect(snapToRoads(O, 178, [ns])!.bearing).toBeCloseTo(180, 0);
});

test('keletre haladva a keresztutcára', () => {
  const s = snapToRoads(O, 92, [ns, ew])!;
  expect(s.distM).toBeCloseTo(8, 0);
  expect(s.bearing).toBeCloseTo(90, 0);
});

test('menetirány nélkül a legközelebbi út', () => {
  expect(snapToRoads(O, null, [ns, ew])!.distM).toBeCloseTo(8, 0);
});

test('túl messzi vagy merőleges úton nincs illesztés', () => {
  expect(snapToRoads(O, 0, [ns], 5)).toBeNull();
  expect(snapToRoads(O, 90, [ns])).toBeNull();
});

test('featureLines: LineString és MultiLineString, a pont kimarad', () => {
  const lines = featureLines([
    { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: ns } },
    { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: [ew, ns] } },
    { type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: O } },
  ]);
  expect(lines).toEqual([ns, ew, ns]);
});

describe('rollingPose', () => {
  const snap = { pos: offsetPoint(O, 90, 10), bearing: 0, distM: 10 };

  test('az útra illesztett pontból az út irányában előrebecsül', () => {
    const p = rollingPose({ pos: O, snap }, 10, 8, 1.2);
    expect(p.heading).toBe(0);
    expect(haversineM(p.pos, offsetPoint(snap.pos, 0, 12))).toBeLessThan(0.1);
  });

  test('út nélkül a nyers pozícióból a menetirányban', () => {
    const p = rollingPose({ pos: O, snap: null }, 10, 90, 1);
    expect(p.heading).toBe(90);
    expect(haversineM(p.pos, offsetPoint(O, 90, 10))).toBeLessThan(0.1);
  });

  test('lassan nincs előrebecslés', () => {
    expect(rollingPose({ pos: O, snap }, 0.5, 8, 1.2)).toEqual({ pos: snap.pos, heading: 0 });
  });
});
