import { pulseOpacity } from './pulse';

test('oscillates between min and max with the given period', () => {
  expect(pulseOpacity(0, 1600, 0.2, 0.55)).toBeCloseTo(0.2, 6);
  expect(pulseOpacity(800, 1600, 0.2, 0.55)).toBeCloseTo(0.55, 6);
  expect(pulseOpacity(1600, 1600, 0.2, 0.55)).toBeCloseTo(0.2, 6);
  const mid = pulseOpacity(400, 1600, 0.2, 0.55);
  expect(mid).toBeGreaterThan(0.2);
  expect(mid).toBeLessThan(0.55);
});
