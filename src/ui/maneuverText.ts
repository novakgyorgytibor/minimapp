import type { Step } from '../types';

// Valhalla maneuver type → rövid magyar szöveg
const LABELS: Record<number, string> = {
  1: 'Indulás',
  2: 'Indulás jobbra',
  3: 'Indulás balra',
  4: 'Megérkezel',
  5: 'Megérkezel, jobb oldalon',
  6: 'Megérkezel, bal oldalon',
  7: 'Tovább',
  8: 'Tovább egyenesen',
  9: 'Enyhén jobbra',
  10: 'Jobbra',
  11: 'Élesen jobbra',
  12: 'Fordulj vissza',
  13: 'Fordulj vissza',
  14: 'Élesen balra',
  15: 'Balra',
  16: 'Enyhén balra',
  17: 'Felhajtó egyenesen',
  18: 'Felhajtó jobbra',
  19: 'Felhajtó balra',
  20: 'Lehajtó jobbra',
  21: 'Lehajtó balra',
  22: 'Maradj egyenesen',
  23: 'Maradj jobbra',
  24: 'Maradj balra',
  25: 'Besorolás',
  26: 'Körforgalom',
  27: 'Ki a körforgalomból',
  28: 'Komp',
  29: 'Le a kompról',
  37: 'Besorolás jobbra',
  38: 'Besorolás balra',
};

export function maneuverText(step: Step): string {
  let label = LABELS[step.type];
  if (!label) return step.instruction;
  if (step.type === 26 && step.roundaboutExitCount) label = `${label}, ${step.roundaboutExitCount}. kijárat`;
  const street = step.streetNames[0];
  return street && step.type !== 4 ? `${label} · ${street}` : label;
}
