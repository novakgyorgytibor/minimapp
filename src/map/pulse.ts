/** Lágy pulzálás (koszinusz) min és max között, period ms-os ütemben; t = eltelt idő (ms). */
export function pulseOpacity(t: number, periodMs: number, min: number, max: number): number {
  const phase = (1 - Math.cos((2 * Math.PI * t) / periodMs)) / 2; // 0 → 1 → 0
  return min + (max - min) * phase;
}
