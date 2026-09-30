import { metersPerPoint, nextView, radiiFor, screenWidthM, viewBbox, zoomBucket } from './viewport';

test('meters per point at zoom 18, lat 47.5 (512px tiles)', () => {
  // 40 075 016.7 * cos(47.5°) / (512 * 2^18)
  expect(metersPerPoint(18, 47.5)).toBeCloseTo(0.2017, 3);
  expect(metersPerPoint(17, 47.5)).toBeCloseTo(2 * metersPerPoint(18, 47.5), 6);
});

test('screen width in meters', () => {
  expect(screenWidthM(18, 47.5, 400)).toBeCloseTo(80.7, 0);
});

test('radiiFor scales the fractions to the outer radius', () => {
  expect(radiiFor(60, [1 / 6, 0.5, 1])).toEqual([10, 30, 60]);
});

test('zoomBucket rounds to 0.25', () => {
  expect(zoomBucket(18.1)).toBe(18);
  expect(zoomBucket(18.13)).toBe(18.25);
});

test('viewBbox is centred with the given half extent', () => {
  const [w, s, e, n] = viewBbox([19, 47.5], 1000);
  expect((w + e) / 2).toBeCloseTo(19, 6);
  expect((s + n) / 2).toBeCloseTo(47.5, 6);
  expect((n - s) * 111_195).toBeCloseTo(2000, -1);
});

describe('nextView', () => {
  const v = { center: [19, 47.5] as [number, number], zoom: 18 };

  test('first view is taken', () => {
    expect(nextView(null, v, 400)).toEqual(v);
  });

  test('tiny pan and tiny zoom keep the same object', () => {
    // 5% of an ~81 m wide screen ≈ 4 m; move 2 m
    expect(nextView(v, { center: [19, 47.5 + 2 / 111_195], zoom: 18.05 }, 400)).toBe(v);
  });

  test('panning more than 5% of the screen width updates', () => {
    const c = { center: [19, 47.5 + 10 / 111_195] as [number, number], zoom: 18 };
    expect(nextView(v, c, 400)).toEqual(c);
  });

  test('zoom bucket change updates', () => {
    const c = { center: v.center, zoom: 17.5 };
    expect(nextView(v, c, 400)).toEqual(c);
  });
});
