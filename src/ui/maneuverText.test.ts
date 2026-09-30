import type { Step } from '../types';
import { laneArrow, lanesToShow, maneuverArrow, maneuverText, signInfo } from './maneuverText';

const step = (kind: string, modifier?: string, extra: Partial<Step> = {}): Step => ({
  kind,
  modifier,
  instruction: 'Valhalla instruction.',
  streetNames: [],
  beginIndex: 0,
  beginDistM: 0,
  ...extra,
});

describe('maneuverText', () => {
  test('turn with street name', () => {
    expect(maneuverText(step('turn', 'right', { streetNames: ['Andrássy út'] }))).toBe('Turn right · Andrássy út');
  });
  test('turn without street name', () => {
    expect(maneuverText(step('turn', 'left'))).toBe('Turn left');
  });
  test('u-turn', () => {
    expect(maneuverText(step('turn', 'uturn'))).toBe('Make a U-turn');
  });
  test('falls back to the road number when there is no name', () => {
    expect(maneuverText(step('fork', 'slight left', { ref: 'M7' }))).toBe('Keep left · M7');
  });
  test('numbered exit', () => {
    expect(maneuverText(step('off ramp', 'slight right', { exitNumber: '16' }))).toBe('Take exit 16');
  });
  test('roundabout with exit number and English ordinals', () => {
    expect(maneuverText(step('roundabout', 'right', { roundaboutExit: 2, streetNames: ['Oktogon'] }))).toBe(
      'Roundabout, 2nd exit · Oktogon',
    );
    expect(maneuverText(step('rotary', undefined, { roundaboutExit: 11 }))).toBe('Roundabout, 11th exit');
    expect(maneuverText(step('roundabout', undefined, { roundaboutExit: 23 }))).toBe('Roundabout, 23rd exit');
  });
  test('arrival', () => {
    expect(maneuverText(step('arrive'))).toBe('Arrive');
    expect(maneuverText(step('arrive', 'right'))).toBe('Arrive, on the right');
  });
  test('unknown kind falls back to the Valhalla instruction', () => {
    expect(maneuverText(step('something new'))).toBe('Valhalla instruction.');
  });
});

describe('arrows', () => {
  test.each([
    ['turn', 'right', '↱'],
    ['turn', 'left', '↰'],
    ['turn', 'slight right', '↗'],
    ['turn', 'sharp left', '↙'],
    ['turn', 'uturn', '↶'],
    ['continue', 'straight', '↑'],
    ['roundabout', 'right', '↺'],
    ['arrive', undefined, '◉'],
  ])('maneuverArrow(%p, %p) = %p', (kind, modifier, arrow) => {
    expect(maneuverArrow(step(kind as string, modifier as string | undefined))).toBe(arrow);
  });

  test('lane arrow uses the first indication', () => {
    expect(laneArrow({ indications: ['straight', 'slight right'], valid: true })).toBe('↑');
    expect(laneArrow({ indications: ['slight right'], valid: false })).toBe('↗');
    expect(laneArrow({ indications: ['none'], valid: false })).toBe('↑');
  });
});

describe('lanesToShow', () => {
  const lanes = [
    { indications: ['straight'], valid: false },
    { indications: ['slight right'], valid: true },
  ];
  test('within 500 m of the maneuver', () => {
    expect(lanesToShow(step('off ramp', 'slight right', { lanes }), 480)).toEqual(lanes);
  });
  test('hidden further away or without lane data', () => {
    expect(lanesToShow(step('off ramp', 'slight right', { lanes }), 800)).toEqual([]);
    expect(lanesToShow(step('turn', 'right'), 100)).toEqual([]);
  });
});

describe('signInfo', () => {
  test('refs before the colon, destinations after', () => {
    expect(signInfo(step('fork', 'slight left', { destinations: 'M7, M1: Győr, Bécs-Wien, BALATON, Nagykanizsa' }))).toEqual({
      exit: undefined,
      refs: ['M7', 'M1'],
      toward: ['Győr', 'Bécs-Wien', 'BALATON'],
    });
  });
  test('exit number, refs from the step when the sign has none', () => {
    expect(signInfo(step('off ramp', 'slight right', { exitNumber: '16', ref: 'M0; E 60', destinations: 'M0 gyűrű ring, Érd észak' }))).toEqual({
      exit: '16',
      refs: ['M0', 'E 60'],
      toward: ['M0 gyűrű ring', 'Érd észak'],
    });
  });
  test('no sign data → null', () => {
    expect(signInfo(step('turn', 'right', { ref: 'M7' }))).toBeNull();
  });
});
