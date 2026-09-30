import buffer from '@turf/buffer';
import { lineString, point } from '@turf/helpers';
import rewind from '@turf/rewind';
import simplify from '@turf/simplify';
import type { Feature, MultiPolygon, Position } from 'geojson';
import type { LngLat } from '../types';

export type MaskGeometry = { type: 'LineString'; coords: LngLat[] } | { type: 'Point'; coord: LngLat };
export type MaskFeature = Feature<MultiPolygon, { radiusM: number }>;

const WORLD: Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
// ~3 m: vizuálisan észrevehetetlen, de a hosszú útvonalak pontszámát drasztikusan csökkenti
const SIMPLIFY_TOLERANCE_DEG = 0.00003;

function baseFeature(geom: MaskGeometry) {
  if (geom.type === 'Point') return point(geom.coord);
  const line = lineString(geom.coords);
  return geom.coords.length > 2 ? simplify(line, { tolerance: SIMPLIFY_TOLERANCE_DEG, highQuality: false }) : line;
}

export function buildMasks(geom: MaskGeometry, radiiM: readonly number[]): MaskFeature[] {
  const base = baseFeature(geom);
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
