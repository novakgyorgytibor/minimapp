import { haversineM } from '../nav/geo';
import type { LngLat } from '../types';

/** Ennél nagyobb ugrásnál (pl. első GPS-jel, újratervezés) nincs csúsztatás, azonnal odaáll. */
export const MARKER_MAX_GLIDE_M = 300;

export interface MarkerPose {
  pos: LngLat;
  bearing: number;
}

/** A két pozíció/irány közötti állapot f ∈ [0, 1] arányban (az irány a rövidebb úton fordul). */
export function lerpPose(from: MarkerPose, to: MarkerPose, f: number): MarkerPose {
  if (f >= 1) return to;
  const k = Math.max(f, 0);
  const diff = ((to.bearing - from.bearing + 540) % 360) - 180;
  return {
    pos: [from.pos[0] + k * (to.pos[0] - from.pos[0]), from.pos[1] + k * (to.pos[1] - from.pos[1])],
    bearing: (from.bearing + k * diff + 360) % 360,
  };
}

/** Csúsztassuk-e a jelölőt, vagy ugorjon (túl messze van). */
export function shouldGlide(from: LngLat, to: LngLat): boolean {
  return haversineM(from, to) <= MARKER_MAX_GLIDE_M;
}
