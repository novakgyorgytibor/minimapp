import type { Step } from '../types';

// Valhalla maneuver type → rövid angol szöveg
const LABELS: Record<number, string> = {
  1: 'Start',
  2: 'Start right',
  3: 'Start left',
  4: 'Arrive',
  5: 'Arrive, on the right',
  6: 'Arrive, on the left',
  7: 'Continue',
  8: 'Continue straight',
  9: 'Bear right',
  10: 'Turn right',
  11: 'Sharp right',
  12: 'Make a U-turn',
  13: 'Make a U-turn',
  14: 'Sharp left',
  15: 'Turn left',
  16: 'Bear left',
  17: 'Take the ramp',
  18: 'Take the ramp right',
  19: 'Take the ramp left',
  20: 'Take the exit right',
  21: 'Take the exit left',
  22: 'Keep straight',
  23: 'Keep right',
  24: 'Keep left',
  25: 'Merge',
  26: 'Roundabout',
  27: 'Exit the roundabout',
  28: 'Take the ferry',
  29: 'Leave the ferry',
  37: 'Merge right',
  38: 'Merge left',
};

function ordinal(n: number): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`;
  return `${n}${({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th'}`;
}

export function maneuverText(step: Step): string {
  let label = LABELS[step.type];
  if (!label) return step.instruction;
  if (step.type === 26 && step.roundaboutExitCount) label = `${label}, ${ordinal(step.roundaboutExitCount)} exit`;
  const street = step.streetNames[0];
  return street && step.type !== 4 ? `${label} · ${street}` : label;
}
