import bboxClip from '@turf/bbox-clip';
import buffer from '@turf/buffer';
import { lineString, multiLineString, point } from '@turf/helpers';
import rewind from '@turf/rewind';
import simplify from '@turf/simplify';
import type { Feature, LineString, MultiLineString, MultiPolygon, Point, Position } from 'geojson';
import type { LngLat } from '../types';

export type MaskGeometry =
  | { type: 'LineString'; coords: LngLat[] }
  | { type: 'MultiLineString'; lines: LngLat[][] }
  | { type: 'Point'; coord: LngLat };
export type MaskFeature = Feature<MultiPolygon, { radiusM: number }>;

const WORLD: Position[] = [[-180, -85], [180, -85], [180, 85], [-180, 85], [-180, -85]];
const M_PER_DEG = 111_195;

export interface MaskOptions {
  /** Csak a [w, s, e, n] dobozba eső útvonalrész számít (a látható terület + ráhagyás). */
  clip?: [number, number, number, number];
}

export function maskBase(
  geom: MaskGeometry,
  { toleranceM, clip }: MaskOptions & { toleranceM: number },
): Feature<LineString | MultiLineString | Point> {
  if (geom.type === 'Point') return point(geom.coord);
  let line: Feature<LineString | MultiLineString> =
    geom.type === 'MultiLineString' ? multiLineString(geom.lines.filter((l) => l.length > 1)) : lineString(geom.coords);
  if (clip) line = bboxClip(line, clip) as Feature<LineString | MultiLineString>;
  if (pointsOf(line) <= 2) return line;
  return simplify(line, { tolerance: toleranceM / M_PER_DEG, highQuality: false });
}

function pointsOf(f: Feature<LineString | MultiLineString>): number {
  return f.geometry.type === 'LineString'
    ? f.geometry.coordinates.length
    : f.geometry.coordinates.reduce((n, l) => n + l.length, 0);
}

/** Teljesen fekete maszkok (még nincs pozíció): semmi sem látszik az utakból. */
export function fullMasks(radiiM: readonly number[]): MaskFeature[] {
  return radiiM.map((radiusM) => ({
    type: 'Feature',
    properties: { radiusM },
    geometry: { type: 'MultiPolygon', coordinates: [[WORLD]] },
  }));
}

export function buildMasks(geom: MaskGeometry, radiiM: readonly number[], options: MaskOptions = {}): MaskFeature[] {
  // A tűrés a legnagyobb sugár 1/8-a: közelről pontos, távolról (nagy sugár) olcsó.
  const base = maskBase(geom, { ...options, toleranceM: Math.max(...radiiM) / 8 });
  const empty =
    base.geometry.type !== 'Point' && pointsOf(base as Feature<LineString | MultiLineString>) === 0;
  return radiiM.map((radiusM) => {
    const buf = empty ? undefined : buffer(base, radiusM, { units: 'meters', steps: 8 });
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
