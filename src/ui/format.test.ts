import { formatClock, formatDistance, formatDuration } from './format';

test.each([
  [0, '0 m'],
  [4, '0 m'],
  [44, '40 m'],
  [995, '1,0 km'],
  [987, '990 m'],
  [1234, '1,2 km'],
  [9960, '10 km'],
  [12_345, '12 km'],
])('formatDistance(%p) = %p', (m, s) => {
  expect(formatDistance(m)).toBe(s);
});

test.each([
  [30, '< 1 perc'],
  [60, '1 perc'],
  [25 * 60 + 20, '25 perc'],
  [3600 + 5 * 60, '1 ó 5 p'],
  [2 * 3600, '2 ó 0 p'],
])('formatDuration(%p) = %p', (s, out) => {
  expect(formatDuration(s)).toBe(out);
});

test('formatClock pads minutes', () => {
  expect(formatClock(new Date(2026, 8, 30, 14, 5))).toBe('14:05');
  expect(formatClock(new Date(2026, 8, 30, 9, 30))).toBe('9:30');
});
