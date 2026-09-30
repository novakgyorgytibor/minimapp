import { effectiveSpeed, locationOptions } from './power';

test('navigation: highest accuracy, every second / 2 m', () => {
  expect(locationOptions(true)).toEqual({ accuracy: 'navigation', timeInterval: 1000, distanceInterval: 2 });
});

test('idle / preview: balanced accuracy, every 5 s / 10 m', () => {
  expect(locationOptions(false)).toEqual({ accuracy: 'balanced', timeInterval: 5000, distanceInterval: 10 });
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
