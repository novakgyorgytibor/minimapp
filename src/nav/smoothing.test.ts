import { haversineM } from './geo';
import { smoothFix, type Fix } from './smoothing';

const M_PER_DEG_LAT = 111_195;
const north = (m: number): [number, number] => [19, 47.5 + m / M_PER_DEG_LAT];
const fix = (m: number, accuracyM: number | null, speedMps: number | null, t: number): Fix => ({ pos: north(m), accuracyM, speedMps, t });

test('first fix is taken as is', () => {
  const s = smoothFix(null, fix(0, 8, 0, 0));
  expect(s.pos).toEqual(north(0));
});

test('a much worse fix right after a good one is ignored (e.g. Wi-Fi/cell position)', () => {
  const good = smoothFix(null, fix(0, 8, 0, 0));
  expect(smoothFix(good, fix(120, 100, 0, 2000))).toBe(good);
});

test('a poor fix is accepted when the last good one is old', () => {
  const good = smoothFix(null, fix(0, 8, 0, 0));
  const s = smoothFix(good, fix(120, 100, 0, 40_000));
  expect(s).not.toBe(good);
});

test('standing still: small jitter does not move the marker', () => {
  const s0 = smoothFix(null, fix(0, 10, 0, 0));
  expect(smoothFix(s0, fix(4, 10, 0, 1000))).toBe(s0);
  expect(smoothFix(s0, fix(4, 10, null, 1000))).toBe(s0);
});

test('driving: follows the new fix closely (no lag)', () => {
  const s0 = smoothFix(null, fix(0, 8, 14, 0));
  const s1 = smoothFix(s0, fix(14, 8, 14, 1000));
  expect(haversineM(s1.pos, north(14))).toBeLessThan(3);
});

test('noisy fixes while walking are damped (moves only part of the way)', () => {
  const s0 = smoothFix(null, fix(0, 15, 1.2, 0));
  const s1 = smoothFix(s0, fix(20, 15, 1.2, 1000));
  const moved = haversineM(s0.pos, s1.pos);
  expect(moved).toBeGreaterThan(2);
  expect(moved).toBeLessThan(15);
});

test('standing still: jitter within the reported accuracy is ignored (city / indoor GPS wander)', () => {
  const s0 = smoothFix(null, fix(0, 12, 0, 0));
  expect(smoothFix(s0, fix(11, 12, 0.6, 1000))).toBe(s0);
  // Android reports small bogus speeds while standing
  expect(smoothFix(s0, fix(7, 5, 1.2, 1000))).toBe(s0);
});

test('walking still moves once the displacement exceeds the hold radius', () => {
  const s0 = smoothFix(null, fix(0, 5, 1.2, 0));
  expect(smoothFix(s0, fix(15, 5, 1.2, 10_000))).not.toBe(s0);
});
