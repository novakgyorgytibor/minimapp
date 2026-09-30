import type { LngLat } from '../types';
import { haversineM } from './geo';

export interface Fix {
  pos: LngLat;
  /** A mérés hibahatára (m); null = ismeretlen. */
  accuracyM: number | null;
  speedMps: number | null;
  /** ms */
  t: number;
}

export interface Smoothed {
  pos: LngLat;
  /** A becslés szórásnégyzete (m²). */
  varianceM2: number;
  /** Az utolsó elfogadott mérés ideje (ms). */
  t: number;
}

const DEFAULT_ACCURACY_M = 15;
const POOR_ACCURACY_M = 50;
const STALE_MS = 30_000;
const HOLD_M = 5;

/**
 * Pozíciósimítás a jelölő ugrálása ellen:
 * - friss jó mérés után a sokkal rosszabb (pl. Wi-Fi/cella alapú) méréseket eldobja,
 * - álló helyzetben a pár méteres remegést figyelmen kívül hagyja,
 * - egyébként egyszerű Kalman-szűrő: a mérés pontossága és a sebesség alapján súlyoz
 *   (gyors haladásnál szinte azonnal követ, lassan/pontatlanul csillapít).
 * Változatlan becslésnél ugyanazt az objektumot adja vissza (nincs újrarenderelés).
 */
export function smoothFix(prev: Smoothed | null, fix: Fix): Smoothed {
  const acc = fix.accuracyM !== null && fix.accuracyM > 0 ? fix.accuracyM : DEFAULT_ACCURACY_M;
  const r = acc * acc;
  if (!prev) return { pos: fix.pos, varianceM2: r, t: fix.t };

  const dt = Math.max(0, (fix.t - prev.t) / 1000);
  const prevAcc = Math.sqrt(prev.varianceM2);
  if (acc > POOR_ACCURACY_M && prevAcc < acc / 2 && fix.t - prev.t < STALE_MS) return prev;

  const speed = fix.speedMps !== null && fix.speedMps > 0 ? fix.speedMps : 0;
  if (speed < 1 && haversineM(prev.pos, fix.pos) < Math.max(HOLD_M, acc / 2)) return prev;

  // Folyamatzaj: amennyit az idő alatt mozoghattunk (legalább gyalogtempó)
  const q = 4 * Math.max(speed, 1) ** 2 * Math.max(dt, 0.1);
  const p = prev.varianceM2 + q;
  const k = p / (p + r);
  const pos: LngLat = [prev.pos[0] + k * (fix.pos[0] - prev.pos[0]), prev.pos[1] + k * (fix.pos[1] - prev.pos[1])];
  return { pos, varianceM2: (1 - k) * p, t: fix.t };
}
