import type { Lang } from '../i18n/strings';

export function formatDistance(m: number, lang: Lang = 'en'): string {
  const rounded = Math.round(m / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  const km = m / 1000;
  if (km < 9.95) return `${lang === 'hu' ? km.toFixed(1).replace('.', ',') : km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
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
