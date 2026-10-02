import { buildRoute } from '../services/route';
import { corridorBoxes } from './corridorBoxes';

// ~7,5 km kelet felé, majd ~3,3 km észak felé
const route = buildRoute([[19, 47.5], [19.05, 47.5], [19.1, 47.5], [19.1, 47.53]], 900, []);
const inside = (b: number[], [x, y]: number[]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];

test('splits the route into chunks whose padded boxes cover every route point', () => {
  const boxes = corridorBoxes(route, 2000, 300);
  expect(boxes.length).toBeGreaterThan(1);
  for (const c of route.coords) expect(boxes.some((b) => inside(b, c))).toBe(true);
});

test('padding extends each box on every side', () => {
  const [b] = corridorBoxes(buildRoute([[19, 47.5], [19.001, 47.5]], 60, []), 2000, 300);
  expect(b[1]).toBeLessThan(47.5 - 0.0026);
  expect(b[3]).toBeGreaterThan(47.5 + 0.0026);
  expect(b[0]).toBeLessThan(19 - 0.0039);
  expect(b[2]).toBeGreaterThan(19.001 + 0.0039);
});

test('consecutive boxes share their boundary point (no gap)', () => {
  const boxes = corridorBoxes(route, 2000, 0);
  for (let i = 1; i < boxes.length; i++) {
    const a = boxes[i - 1];
    const b = boxes[i];
    const overlap = a[0] <= b[2] && b[0] <= a[2] && a[1] <= b[3] && b[1] <= a[3];
    expect(overlap).toBe(true);
  }
});

test('a single-point route still gives one box', () => {
  expect(corridorBoxes(buildRoute([[19, 47.5]], 0, []), 2000, 100)).toHaveLength(1);
});

test('a long straight segment is split as well', () => {
  const straight = buildRoute([[19, 47.5], [19.1, 47.6]], 1000, []);
  const boxes = corridorBoxes(straight, 2000, 0);
  expect(boxes.length).toBeGreaterThanOrEqual(Math.ceil(straight.distanceM / 2000));
  for (const b of boxes) expect(b[2] - b[0]).toBeLessThan(0.03);
});
