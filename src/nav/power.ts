import { config } from '../config';

export interface LocationOptions {
  accuracy: 'navigation' | 'high';
  timeInterval: number;
  distanceInterval: number;
}

/** Akkukímélés: legnagyobb GPS-pontosság és sűrű mérés csak navigáció közben, egyébként ritkább. */
export function locationOptions(navigating: boolean): LocationOptions {
  return navigating ? config.gpsNavigating : config.gpsIdle;
}

/** Ennyi ms új mérés nélkül a sebességet 0-nak tekintjük (álló helyzetben a távolságszűrő miatt nem jön mérés). */
export const SPEED_STALE_MS = { navigating: 3000, idle: 12_000 } as const;

export function effectiveSpeed({
  speed,
  lastFixAt,
  now,
  navigating,
}: {
  speed: number | null;
  lastFixAt: number;
  now: number;
  navigating: boolean;
}): number | null {
  if (speed === null) return null;
  const stale = now - lastFixAt > (navigating ? SPEED_STALE_MS.navigating : SPEED_STALE_MS.idle);
  return stale ? 0 : speed;
}

/** Ennél gyorsabban haladunk (5 km/h) → járműben vagyunk, nem csak a GPS zajlik. */
export const ROLLING_MPS = 5 / 3.6;

/** Útvonal nélkül, haladás közben ennyi ideig marad ébren a képernyő az utolsó 5 km/h feletti mérés után (piros lámpa, dugó). */
export const ROLLING_KEEP_AWAKE_MS = 3 * 60_000;

/**
 * Meddig tartsuk ébren a képernyőt útvonal nélkül? Ha 5 km/h felett haladunk, a telefon valószínűleg ki van rakva
 * az autóban → most + ROLLING_KEEP_AWAKE_MS; különben marad az eddigi határidő.
 */
export function rollingAwakeUntil(prevUntil: number, speedMps: number | null, now: number): number {
  return speedMps !== null && speedMps > ROLLING_MPS ? now + ROLLING_KEEP_AWAKE_MS : prevUntil;
}
