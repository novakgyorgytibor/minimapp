import { maneuverText } from './maneuverText';
import type { Step } from '../types';

const step = (type: number, streetNames: string[] = [], extra: Partial<Step> = {}): Step => ({
  type,
  instruction: 'Valhalla instruction.',
  streetNames,
  beginIndex: 0,
  beginDistM: 0,
  ...extra,
});

test('turn with street name', () => {
  expect(maneuverText(step(10, ['Andrássy út']))).toBe('Turn right · Andrássy út');
});

test('turn without street name', () => {
  expect(maneuverText(step(15))).toBe('Turn left');
});

test('roundabout with exit count', () => {
  expect(maneuverText(step(26, ['Oktogon'], { roundaboutExitCount: 2 }))).toBe('Roundabout, 2nd exit · Oktogon');
});

test('arrival', () => {
  expect(maneuverText(step(4))).toBe('Arrive');
});

test('unknown type falls back to the Valhalla instruction', () => {
  expect(maneuverText(step(999))).toBe('Valhalla instruction.');
});

test.each([
  [1, 'Roundabout, 1st exit'],
  [3, 'Roundabout, 3rd exit'],
  [4, 'Roundabout, 4th exit'],
  [11, 'Roundabout, 11th exit'],
  [12, 'Roundabout, 12th exit'],
  [22, 'Roundabout, 22nd exit'],
])('roundabout exit %p uses English ordinals', (n, out) => {
  expect(maneuverText(step(26, [], { roundaboutExitCount: n }))).toBe(out);
});
