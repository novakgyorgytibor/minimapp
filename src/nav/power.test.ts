import { effectiveSpeed, locationOptions, ROLLING_KEEP_AWAKE_MS, rollingAwakeUntil } from './power';

test('navigation: highest accuracy, every second / 2 m', () => {
  expect(locationOptions(true)).toEqual({ accuracy: 'navigation', timeInterval: 1000, distanceInterval: 2 });
});

test('idle / preview: GPS (high, not Wi-Fi/cell based balanced), every 5 s / 10 m', () => {
  expect(locationOptions(false)).toEqual({ accuracy: 'high', timeInterval: 5000, distanceInterval: 10 });
});

describe('effectiveSpeed', () => {
  test('fresh fix → its speed', () => {
    expect(effectiveSpeed({ speed: 13.9, lastFixAt: 10_000, now: 11_000, navigating: true })).toBe(13.9);
  });
  test('no new fix for a while (standing still, distance filter) → 0', () => {
    expect(effectiveSpeed({ speed: 13.9, lastFixAt: 10_000, now: 13_500, navigating: true })).toBe(0);
    expect(effectiveSpeed({ speed: 13.9, lastFixAt: 10_000, now: 21_000, navigating: false })).toBe(13.9);
    expect(effectiveSpeed({ speed: 13.9, lastFixAt: 10_000, now: 23_000, navigating: false })).toBe(0);
  });
  test('unknown speed stays unknown', () => {
    expect(effectiveSpeed({ speed: null, lastFixAt: 10_000, now: 30_000, navigating: true })).toBeNull();
  });
});

describe('rollingAwakeUntil', () => {
  test('above 5 km/h → stays awake for the hold time from now', () => {
    expect(rollingAwakeUntil(0, 10 / 3.6, 100_000)).toBe(100_000 + ROLLING_KEEP_AWAKE_MS);
  });
  test('below / at 5 km/h or unknown → keeps the previous deadline (red light keeps it awake, then it expires)', () => {
    expect(rollingAwakeUntil(150_000, 0, 120_000)).toBe(150_000);
    expect(rollingAwakeUntil(150_000, 5 / 3.6, 120_000)).toBe(150_000);
    expect(rollingAwakeUntil(0, null, 120_000)).toBe(0);
  });
  test('moving again extends the deadline', () => {
    expect(rollingAwakeUntil(150_000, 20, 140_000)).toBe(140_000 + ROLLING_KEEP_AWAKE_MS);
  });
});
