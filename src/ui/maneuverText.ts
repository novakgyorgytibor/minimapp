import type { Lang } from '../i18n/strings';
import type { Lane, Step } from '../types';

const LANES_WITHIN_M = 500;
const MAX_TOWARD = 3;

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

type Side = 'left' | 'right';

interface Phrases {
  turn: Record<string, string>;
  start: string;
  arrive: string;
  arriveSide: (s: Side) => string;
  roundaboutExit: (n: number) => string;
  enterRoundabout: string;
  exitRoundabout: string;
  merge: string;
  mergeSide: (s: Side) => string;
  ramp: string;
  rampSide: (s: Side) => string;
  exitNumber: (n: string) => string;
  exit: string;
  exitSide: (s: Side) => string;
  keep: (s: Side | 'straight') => string;
  cont: string;
}

const EN: Phrases = {
  turn: {
    uturn: 'Make a U-turn',
    'sharp right': 'Sharp right',
    right: 'Turn right',
    'slight right': 'Bear right',
    straight: 'Continue straight',
    'slight left': 'Bear left',
    left: 'Turn left',
    'sharp left': 'Sharp left',
  },
  start: 'Start',
  arrive: 'Arrive',
  arriveSide: (s) => `Arrive, on the ${s}`,
  roundaboutExit: (n) => `Roundabout, ${ordinal(n)} exit`,
  enterRoundabout: 'Enter the roundabout',
  exitRoundabout: 'Exit the roundabout',
  merge: 'Merge',
  mergeSide: (s) => `Merge ${s}`,
  ramp: 'Take the ramp',
  rampSide: (s) => `Take the ramp ${s}`,
  exitNumber: (n) => `Take exit ${n}`,
  exit: 'Take the exit',
  exitSide: (s) => `Take the exit ${s}`,
  keep: (s) => `Keep ${s}`,
  cont: 'Continue',
};

const HU_SIDE: Record<Side, string> = { left: 'balra', right: 'jobbra' };

const HU: Phrases = {
  turn: {
    uturn: 'Fordulj vissza',
    'sharp right': 'Élesen jobbra',
    right: 'Fordulj jobbra',
    'slight right': 'Enyhén jobbra',
    straight: 'Tovább egyenesen',
    'slight left': 'Enyhén balra',
    left: 'Fordulj balra',
    'sharp left': 'Élesen balra',
  },
  start: 'Indulás',
  arrive: 'Megérkezel',
  arriveSide: (s) => `Megérkezel, ${s === 'left' ? 'bal' : 'jobb'} oldalon`,
  roundaboutExit: (n) => `Körforgalom, ${n}. kijárat`,
  enterRoundabout: 'Hajts be a körforgalomba',
  exitRoundabout: 'Hajts ki a körforgalomból',
  merge: 'Besorolás',
  mergeSide: (s) => `Besorolás ${HU_SIDE[s]}`,
  ramp: 'Hajts fel',
  rampSide: (s) => `Hajts fel ${HU_SIDE[s]}`,
  exitNumber: (n) => `Hajts le a ${n}. kijáraton`,
  exit: 'Hajts le',
  exitSide: (s) => `Hajts le ${HU_SIDE[s]}`,
  keep: (s) => `Tarts ${s === 'straight' ? 'egyenesen' : HU_SIDE[s]}`,
  cont: 'Tovább',
};

const PHRASES: Record<Lang, Phrases> = { en: EN, hu: HU };

const side = (modifier?: string): Side | undefined =>
  modifier?.includes('left') ? 'left' : modifier?.includes('right') ? 'right' : undefined;

function label(step: Step, p: Phrases): string | undefined {
  const { kind, modifier } = step;
  const sd = side(modifier);
  switch (kind) {
    case 'depart':
      return p.start;
    case 'arrive':
      return sd ? p.arriveSide(sd) : p.arrive;
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn':
      return step.roundaboutExit ? p.roundaboutExit(step.roundaboutExit) : p.enterRoundabout;
    case 'exit roundabout':
    case 'exit rotary':
      return p.exitRoundabout;
    case 'merge':
      return sd ? p.mergeSide(sd) : p.merge;
    case 'on ramp':
      return sd ? p.rampSide(sd) : p.ramp;
    case 'off ramp':
      return step.exitNumber ? p.exitNumber(step.exitNumber) : sd ? p.exitSide(sd) : p.exit;
    case 'fork':
      return p.keep(sd ?? 'straight');
    case 'new name':
    case 'continue':
      return modifier && modifier !== 'straight' ? p.turn[modifier] : p.cont;
    case 'turn':
    case 'end of road':
    case 'notification':
      return modifier ? p.turn[modifier] : undefined;
    default:
      return undefined;
  }
}

export function maneuverText(step: Step, lang: Lang = 'en'): string {
  const l = label(step, PHRASES[lang]);
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
