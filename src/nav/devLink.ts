import type { LngLat } from '../types';

export interface DevLink {
  dest: LngLat;
  label: string;
  start: boolean;
}

/**
 * Fejlesztői mélylink a szimulátoros teszthez (csak __DEV__ buildben kötjük be):
 *   hu.minimapp.app://navigate?lat=47.39&lon=18.91&label=Érd&start=1
 */
export function parseDevLink(url: string | null): DevLink | null {
  const m = url?.match(/^[a-z0-9.+-]+:\/\/navigate\?(.*)$/i);
  if (!m) return null;
  const q: Record<string, string> = {};
  for (const part of m[1].split('&')) {
    const [k, v = ''] = part.split('=');
    q[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  const lat = Number(q.lat);
  const lon = Number(q.lon);
  if (!q.lat || !q.lon || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { dest: [lon, lat], label: q.label || 'Dev', start: q.start === '1' };
}
