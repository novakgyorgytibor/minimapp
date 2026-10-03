import type { Lang } from '../i18n/strings';

export function formatDistance(m: number, lang: Lang = 'en'): string {
  const rounded = Math.round(m / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  const km = m / 1000;
  if (km < 9.95) return `${lang === 'hu' ? km.toFixed(1).replace('.', ',') : km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

/** 1 km alatt a kanyarig hátralévő táv ennyivel kevesebbnek látszik: az utolsó métereken már „0 m” → legyen idő reagálni. */
export const MANEUVER_LEAD_M = 20;

/** A manőverig kijelzett táv (m): 1 km alatt MANEUVER_LEAD_M-rel kevesebb (legalább 0). */
export function maneuverDistanceShown(m: number): number {
  return m < 1000 ? Math.max(0, m - MANEUVER_LEAD_M) : m;
}

export function formatDuration(s: number, lang: Lang = 'en'): string {
  const min = Math.round(s / 60);
  const [minU, hU, mU] = lang === 'hu' ? ['perc', 'ó', 'p'] : ['min', 'h', 'min'];
  if (s < 60) return `< 1 ${minU}`;
  if (min < 60) return `${min} ${minU}`;
  return `${Math.floor(min / 60)} ${hU} ${min % 60} ${mU}`;
}

export function formatClock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** m/s → egész km/h szövegként; ismeretlen sebesség (null vagy negatív, ahogy az iOS jelzi) → null. */
export function formatSpeedKmh(mps: number | null): string | null {
  if (mps === null || mps < 0) return null;
  return String(Math.round(mps * 3.6));
}
