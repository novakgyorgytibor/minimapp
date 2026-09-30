export function formatDistance(m: number): string {
  const rounded = Math.round(m / 10) * 10;
  if (rounded < 1000) return `${rounded} m`;
  const km = m / 1000;
  if (km < 9.95) return `${km.toFixed(1)} km`;
  return `${Math.round(km)} km`;
}

export function formatDuration(s: number): string {
  const min = Math.round(s / 60);
  if (s < 60) return '< 1 min';
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

export function formatClock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}
