import { lerpPose, shouldGlide } from './markerAnim';

test('lerpPose interpolates position linearly and clamps f', () => {
  const a = { pos: [19, 47] as [number, number], bearing: 10 };
  const b = { pos: [19.002, 47.001] as [number, number], bearing: 50 };
  const mid = lerpPose(a, b, 0.5).pos;
  expect(mid[0]).toBeCloseTo(19.001, 9);
  expect(mid[1]).toBeCloseTo(47.0005, 9);
  expect(lerpPose(a, b, 0.5).bearing).toBeCloseTo(30, 6);
  expect(lerpPose(a, b, -1)).toEqual(a);
  expect(lerpPose(a, b, 2)).toEqual(b);
});

test('lerpPose turns the shorter way across north', () => {
  const r = lerpPose({ pos: [0, 0], bearing: 350 }, { pos: [0, 0], bearing: 10 }, 0.5);
  expect(r.bearing).toBeCloseTo(0, 6);
});

test('shouldGlide only for small jumps', () => {
  expect(shouldGlide([19, 47.5], [19.0003, 47.5])).toBe(true); // ~23 m
  expect(shouldGlide([19, 47.5], [19.01, 47.5])).toBe(false); // ~750 m
});
