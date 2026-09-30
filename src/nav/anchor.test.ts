import { nextAnchor } from './anchor';

const M_PER_DEG_LAT = 111_195;
const north = (m: number): [number, number] => [19, 47.5 + m / M_PER_DEG_LAT];

test('first candidate becomes the anchor', () => {
  expect(nextAnchor(null, [19, 47.5], 10)).toEqual([19, 47.5]);
});

test('no candidate keeps the anchor', () => {
  expect(nextAnchor([19, 47.5], null, 10)).toEqual([19, 47.5]);
});

test('small moves keep the same anchor object (no mask rebuild)', () => {
  const prev: [number, number] = [19, 47.5];
  expect(nextAnchor(prev, north(5), 10)).toBe(prev);
});

test('moves beyond the threshold move the anchor', () => {
  expect(nextAnchor([19, 47.5], north(15), 10)).toEqual(north(15));
});
