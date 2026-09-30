import type { LngLat } from '../types';
import { haversineM } from './geo';

/** A maszk-horgony csak minMoveM-nél nagyobb elmozdulásnál lép (különben ugyanaz az objektum marad). */
export function nextAnchor(prev: LngLat | null, candidate: LngLat | null, minMoveM: number): LngLat | null {
  if (!candidate) return prev;
  if (!prev || haversineM(prev, candidate) > minMoveM) return candidate;
  return prev;
}
