import { maneuverText } from './maneuverText';
import type { Step } from '../types';

const step = (type: number, streetNames: string[] = [], extra: Partial<Step> = {}): Step => ({
  type,
  instruction: 'Valhalla szöveg.',
  streetNames,
  beginIndex: 0,
  beginDistM: 0,
  ...extra,
});

test('turn with street name', () => {
  expect(maneuverText(step(10, ['Andrássy út']))).toBe('Jobbra · Andrássy út');
});

test('turn without street name', () => {
  expect(maneuverText(step(15))).toBe('Balra');
});

test('roundabout with exit count', () => {
  expect(maneuverText(step(26, ['Oktogon'], { roundaboutExitCount: 2 }))).toBe('Körforgalom, 2. kijárat · Oktogon');
});

test('arrival', () => {
  expect(maneuverText(step(4))).toBe('Megérkezel');
});

test('unknown type falls back to the Valhalla instruction', () => {
  expect(maneuverText(step(999))).toBe('Valhalla szöveg.');
});
