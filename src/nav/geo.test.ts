import { haversineM } from './geo';

test('0.01° latitude ≈ 1112 m', () => {
  expect(haversineM([19, 47.5], [19, 47.51])).toBeCloseTo(1111.95, 0);
});

test('same point is 0', () => {
  expect(haversineM([19, 47.5], [19, 47.5])).toBe(0);
});
