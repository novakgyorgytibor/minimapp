import { useEffect, useRef, useState } from 'react';
import { getSpeedLimit, pushTrail, shouldQuerySpeedLimit } from '../services/speedLimit';
import type { LngLat } from '../types';

/** Aktuális sebességkorlát (km/h), csak ha látszania kell; ritkítva kérdezi le (10 s / 150 m). */
export function useSpeedLimit(pos: LngLat | null, visible: boolean): number | null {
  const [limit, setLimit] = useState<number | null>(null);
  const trail = useRef<LngLat[]>([]);
  const last = useRef<{ at: number; pos: LngLat } | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    if (!pos) return;
    trail.current = pushTrail(trail.current, pos);
    if (!visible || inflight.current || trail.current.length < 2) return;
    const now = Date.now();
    if (!shouldQuerySpeedLimit(last.current, pos, now)) return;
    last.current = { at: now, pos };
    inflight.current = true;
    getSpeedLimit(trail.current)
      .then(setLimit)
      .catch(() => {}) // hálózati hiba: marad az utolsó ismert érték
      .finally(() => {
        inflight.current = false;
      });
  }, [pos, visible]);

  useEffect(() => {
    if (!visible) {
      setLimit(null);
      last.current = null;
    }
  }, [visible]);

  return visible ? limit : null;
}
