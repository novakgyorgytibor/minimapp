import { useEffect, useRef, useState } from 'react';
import { config } from '../config';
import type { Progress } from '../nav/progress';
import { getTrafficTimeS, supportingPoints, trafficEnabled, trafficFactor } from '../services/traffic';
import type { Route } from '../types';

const PROGRESS_WAIT_MS = 5_000;

interface TrafficInput {
  /** Csak autóval (a TomTom forgalma kerékpárra / gyalog nem értelmes). */
  active: boolean;
  /** Előnézetben a választott és az alternatív útvonal egészére kérdezünk. */
  previewRoutes: (Route | null)[];
  /** Navigáció közben a hátralévő részre, trafficRefreshMs-onként. */
  navRoute: Route | null;
  progress: Progress | null;
}

/**
 * A Valhalla-idők forgalmi szorzója útvonalanként (lásd trafficFactor). null = nincs adat (nincs kulcs, elfogyott a
 * keret, nincs net) → a Valhalla ideje marad. Újratervezés után az új útvonalra az utolsó szorzó él tovább, amíg nem
 * jön friss adat.
 */
export function useTraffic({ active, previewRoutes, navRoute, progress }: TrafficInput): (r: Route | null) => number | null {
  const enabled = active && trafficEnabled();
  const [factors, setFactors] = useState<ReadonlyMap<Route, number>>(new Map());
  const [navFactor, setNavFactor] = useState<number | null>(null);
  const requested = useRef(new WeakSet<Route>());
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const lastNavAt = useRef(0);

  const [a, b] = previewRoutes;
  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    for (const r of [a, b]) {
      if (!r || requested.current.has(r)) continue;
      requested.current.add(r);
      getTrafficTimeS(supportingPoints(r, 0), r.distanceM, ctrl.signal)
        .then((s) => {
          const f = trafficFactor(s, r.durationS);
          if (f !== null) setFactors((m) => new Map(m).set(r, f));
        })
        .catch(() => requested.current.delete(r)); // következő alkalommal újra próbálható
    }
    return () => ctrl.abort();
  }, [enabled, a, b]);

  useEffect(() => {
    if (!enabled || !navRoute) {
      setNavFactor(null);
      lastNavAt.current = 0;
      return;
    }
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const run = () => {
      const p = progressRef.current;
      // Még nincs illesztés (épp indultunk) → hamarosan újra
      if (!p || p.remainingS <= 0) {
        timer = setTimeout(run, PROGRESS_WAIT_MS);
        return;
      }
      lastNavAt.current = Date.now();
      getTrafficTimeS(supportingPoints(navRoute, p.distAlongM), p.remainingM, ctrl.signal)
        .then((s) => {
          const f = trafficFactor(s, p.remainingS);
          if (f !== null) setNavFactor(f);
        })
        .catch(() => {}); // marad az előző szorzó
      timer = setTimeout(run, config.trafficRefreshMs);
    };
    // Induláskor az előnézetben kapott szorzó még friss; újratervezés után legfeljebb trafficMinIntervalMs-onként
    const first =
      lastNavAt.current === 0 && factors.has(navRoute)
        ? config.trafficRefreshMs
        : Math.max(0, config.trafficMinIntervalMs - (Date.now() - lastNavAt.current));
    timer = setTimeout(run, first);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
    // factors szándékosan nincs a függőségek között: csak az indulás pillanatában számít
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, navRoute]);

  // Navigáció közben: friss adat → az előnézet szorzója → (újratervezés után) az előző útvonal szorzója
  const carried = useRef<number | null>(null);
  const nav = enabled && navRoute ? (navFactor ?? factors.get(navRoute) ?? carried.current) : null;
  carried.current = nav;

  return (r) => {
    if (!enabled || !r) return null;
    return r === navRoute ? nav : (factors.get(r) ?? null);
  };
}
