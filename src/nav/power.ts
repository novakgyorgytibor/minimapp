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
