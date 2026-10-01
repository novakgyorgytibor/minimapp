import { haversineM } from './geo';
import type { LngLat } from '../types';

export interface RawFix {
  pos: LngLat;
  /** ms */
  t: number;
  accuracyM: number | null;
}

/** Ennyi idő méréseit nézzük. */
export const STILL_WINDOW_MS = 8000;
// Ennél kisebb nettó elmozdulás biztosan zaj; ennél nagyobb hibahatárt sem veszünk figyelembe
const MIN_STILL_M = 4;
// A felső korlát kisebb, mint amennyit gyalog az ablak alatt megteszünk (8 s × 1,4 m/s ≈ 11 m) → a séta sosem „állás”
const MAX_STILL_M = 8;

/** Az ablakon kívüli régi mérések eldobása, az új hozzáadása. */
export function pushFix(history: RawFix[], fix: RawFix): RawFix[] {
  return [...history.filter((f) => fix.t - f.t <= STILL_WINDOW_MS), fix];
}

/**
 * Állunk-e? A telefon álló helyzetben is jelez hamis sebességet, a pozíció pedig vándorol.
 * Ha az elmúlt pár másodpercben a nettó elmozdulás a mérési hiba fele alatt marad, állónak tekintjük.
 */
export function isStill(history: RawFix[]): boolean {
  if (history.length < 3) return false;
  const first = history[0];
  const last = history[history.length - 1];
  if (last.t - first.t < STILL_WINDOW_MS * 0.6) return false;
  const accs = history.map((f) => f.accuracyM ?? MAX_STILL_M * 2);
  const limit = Math.min(MAX_STILL_M, Math.max(MIN_STILL_M, Math.min(...accs) / 2));
  return history.every((f) => haversineM(f.pos, last.pos) <= limit);
}
