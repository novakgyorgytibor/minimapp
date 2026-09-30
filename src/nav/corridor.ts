import buffer from '@turf/buffer';
import { lineString, point } from '@turf/helpers';
import rewind from '@turf/rewind';
import simplify from '@turf/simplify';
import type { Feature, LineString, MultiPolygon, Point, Position } from 'geojson';
import type { LngLat } from '../types';
import { haversineM } from './geo';

export type MaskGeometry = { type: 'LineString'; coords: LngLat[] } | { type: 'Point'; coord: LngLat };
export type MaskFeature = Feature<MultiPolygon, { radiusM: number }>;

const WORLD: Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
// Egyszerűsítési tűrés az útvonal hossza szerint: rövid útvonalon ~3 m (észrevehetetlen),
// hosszún durvább, különben a buffer (JSTS) Hermesen másodpercekre megfagyasztaná az appot.
function simplifyToleranceDeg(coords: LngLat[]): number {
  const lengthM = coords.reduce((sum, c, i) => (i === 0 ? 0 : sum + haversineM(coords[i - 1], c)), 0);
  if (lengthM > 100_000) return 0.0003; // ~30 m
  if (lengthM > 50_000) return 0.0002; // ~20 m
  if (lengthM > 10_000) return 0.0001; // ~10 m
  return 0.00003; // ~3 m
}

export function maskBase(geom: MaskGeometry): Feature<LineString | Point> {
  if (geom.type === 'Point') return point(geom.coord);
  const line = lineString(geom.coords);
  if (geom.coords.length <= 2) return line;
  return simplify(line, { tolerance: simplifyToleranceDeg(geom.coords), highQuality: false });
}

/** Teljesen fekete maszkok (még nincs pozíció): semmi sem látszik az utakból. */
export function fullMasks(radiiM: readonly number[]): MaskFeature[] {
  return radiiM.map((radiusM) => ({
    type: 'Feature',
    properties: { radiusM },
    geometry: { type: 'MultiPolygon', coordinates: [[WORLD]] },
  }));
}

export function buildMasks(geom: MaskGeometry, radiiM: readonly number[]): MaskFeature[] {
  const base = maskBase(geom);
  return radiiM.map((radiusM) => {
    const buf = buffer(base, radiusM, { units: 'meters', steps: 8 });
    const polys: Position[][][] =
      !buf ? [] : buf.geometry.type === 'Polygon' ? [buf.geometry.coordinates] : buf.geometry.coordinates;
    const holes = polys.map((p) => p[0]);
    const islands = polys.flatMap((p) => p.slice(1).map((inner) => [inner]));
    const feature: MaskFeature = {
      type: 'Feature',
      properties: { radiusM },
      geometry: { type: 'MultiPolygon', coordinates: [[WORLD, ...holes], ...islands] },
    };
    return rewind(feature) as MaskFeature;
  });
}
