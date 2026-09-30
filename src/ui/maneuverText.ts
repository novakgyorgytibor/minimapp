import type { Lane, Step } from '../types';

const LANES_WITHIN_M = 500;
const MAX_TOWARD = 3;

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

const TURN: Record<string, string> = {
  uturn: 'Make a U-turn',
  'sharp right': 'Sharp right',
  right: 'Turn right',
  'slight right': 'Bear right',
  straight: 'Continue straight',
  'slight left': 'Bear left',
  left: 'Turn left',
  'sharp left': 'Sharp left',
};

const side = (modifier?: string) =>
  modifier?.includes('left') ? 'left' : modifier?.includes('right') ? 'right' : undefined;

function label(step: Step): string | undefined {
  const { kind, modifier } = step;
  switch (kind) {
    case 'depart':
      return 'Start';
    case 'arrive':
      return side(modifier) ? `Arrive, on the ${side(modifier)}` : 'Arrive';
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return step.roundaboutExit ? `Roundabout, ${ordinal(step.roundaboutExit)} exit` : 'Enter the roundabout';
    case 'exit roundabout':
    case 'exit rotary':
      return 'Exit the roundabout';
    case 'merge':
      return side(modifier) ? `Merge ${side(modifier)}` : 'Merge';
    case 'on ramp':
      return side(modifier) ? `Take the ramp ${side(modifier)}` : 'Take the ramp';
    case 'off ramp':
      return step.exitNumber ? `Take exit ${step.exitNumber}` : side(modifier) ? `Take the exit ${side(modifier)}` : 'Take the exit';
    case 'fork':
      return `Keep ${side(modifier) ?? 'straight'}`;
    case 'new name':
    case 'continue':
      return modifier && modifier !== 'straight' ? TURN[modifier] : 'Continue';
    case 'turn':
    case 'end of road':
    case 'notification':
      return modifier ? TURN[modifier] : undefined;
    default:
      return undefined;
  }
}

export function maneuverText(step: Step): string {
  const l = label(step);
  if (!l) return step.instruction;
  const street = step.streetNames[0] ?? step.ref?.split(';')[0].trim();
  return street && step.kind !== 'arrive' ? `${l} · ${street}` : l;
}

const ARROW: Record<string, string> = {
  uturn: '↶',
  'sharp right': '↘',
  right: '↱',
  'slight right': '↗',
  straight: '↑',
  none: '↑',
  'slight left': '↖',
  left: '↰',
  'sharp left': '↙',
};

export function maneuverArrow(step: Step): string {
  if (step.kind === 'arrive') return '◉';
  if (step.kind === 'roundabout' || step.kind === 'rotary' || step.kind === 'roundabout turn') return '↺';
  return ARROW[step.modifier ?? 'straight'] ?? '↑';
}

export function laneArrow(lane: Lane): string {
  return ARROW[lane.indications[0]] ?? '↑';
}

/** Sávok csak a manőver előtti utolsó 500 m-en. */
export function lanesToShow(step: Step, distToManeuverM: number): Lane[] {
  if (!step.lanes?.length || distToManeuverM > LANES_WITHIN_M) return [];
  return step.lanes;
}

export interface SignInfo {
  exit?: string;
  refs: string[];
  toward: string[];
}

/** Táblaszöveg ("M7, M1: Győr, Bécs-Wien") → útszámok + irányok; kijáratszám ha van. */
export function signInfo(step: Step): SignInfo | null {
  if (!step.destinations && !step.exitNumber) return null;
  const splitList = (s: string, sep: string) => s.split(sep).map((x) => x.trim()).filter(Boolean);
  let refs = step.ref ? splitList(step.ref, ';') : [];
  let toward: string[] = [];
  if (step.destinations) {
    const colon = step.destinations.indexOf(':');
    if (colon >= 0) {
      refs = splitList(step.destinations.slice(0, colon), ',');
      toward = splitList(step.destinations.slice(colon + 1), ',');
    } else {
      toward = splitList(step.destinations, ',');
    }
  }
  return { exit: step.exitNumber, refs, toward: toward.slice(0, MAX_TOWARD) };
}
