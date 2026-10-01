import { haversineM } from '../nav/geo';
import type { LngLat, Place } from '../types';

/** Ennyin belül ugyanannak a helynek számít (a keresők pár méterrel eltérő pontot adhatnak). */
const SAME_SPOT_M = 15;
export const MAX_FAVORITES = 30;

export function findFavorite(list: Place[], coord: LngLat): Place | undefined {
  return list.find((p) => haversineM(p.coord, coord) <= SAME_SPOT_M);
}

/** Kedvencnek jelölés / levétel; az új kedvenc a lista elejére kerül. */
export function toggleFavorite(list: Place[], place: Place): Place[] {
  if (findFavorite(list, place.coord)) return list.filter((p) => haversineM(p.coord, place.coord) > SAME_SPOT_M);
  return [place, ...list].slice(0, MAX_FAVORITES);
}

/** A tárolt JSON ellenőrzése (sérült vagy régi adat ne törje el az appot). */
export function parseFavorites(json: string | null): Place[] {
  if (!json) return [];
  try {
    const v: unknown = JSON.parse(json);
    if (!Array.isArray(v)) return [];
    return v.filter(
      (p): p is Place =>
        !!p &&
        typeof p.name === 'string' &&
        typeof p.detail === 'string' &&
        Array.isArray(p.coord) &&
        p.coord.length === 2 &&
        p.coord.every((n: unknown) => typeof n === 'number' && Number.isFinite(n)),
    );
  } catch {
    return [];
  }
}
