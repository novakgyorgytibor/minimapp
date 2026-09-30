import { angleDiff, pickHeading, smoothHeading } from './heading';

test('moving fast: follows the course', () => {
  expect(pickHeading({ compass: 90, course: 180, speedMps: 2.5, last: null })).toBe(180);
});

test('standing or slow: follows the compass', () => {
  expect(pickHeading({ compass: 90, course: 180, speedMps: 0.5, last: null })).toBe(90);
  expect(pickHeading({ compass: 90, course: 180, speedMps: 1.99, last: null })).toBe(90);
});

test('fast but no valid course: compass', () => {
  expect(pickHeading({ compass: 45, course: -1, speedMps: 5, last: null })).toBe(45);
});

test('no compass (e.g. simulator): course when moving at all, else keep last', () => {
  expect(pickHeading({ compass: null, course: 270, speedMps: 1.2, last: 10 })).toBe(270);
  expect(pickHeading({ compass: null, course: 270, speedMps: 0.2, last: 10 })).toBe(10);
});

test('nothing known yet → null', () => {
  expect(pickHeading({ compass: null, course: null, speedMps: 0, last: null })).toBeNull();
  expect(pickHeading({ compass: -1, course: -1, speedMps: 0, last: null })).toBeNull();
});

test.each([
  [10, 20, 10],
  [359, 1, 2],
  [1, 359, 2],
  [0, 180, 180],
  [90, 270, 180],
  [45, 45, 0],
])('angleDiff(%p, %p) = %p', (a, b, d) => {
  expect(angleDiff(a, b)).toBeCloseTo(d, 6);
});

describe('smoothHeading', () => {
  test('first value is taken as is', () => {
    expect(smoothHeading(null, 90)).toBe(90);
  });
  test('moves only part of the way (low-pass)', () => {
    const h = smoothHeading(90, 130);
    expect(h).toBeGreaterThan(90);
    expect(h).toBeLessThan(110);
  });
  test('wraps around north correctly (350° → 10° goes through 0°, not 180°)', () => {
    const h = smoothHeading(350, 10);
    expect(angleDiff(h, 355)).toBeLessThan(3);
  });
  test('converges to a steady value', () => {
    let h: number = 0;
    for (let i = 0; i < 40; i++) h = smoothHeading(h, 200);
    expect(angleDiff(h, 200)).toBeLessThan(1);
  });
});
