import type { MapRef } from '@maplibre/maplibre-react-native';
import { type RefObject, useEffect, useRef, useState } from 'react';
import { roadLayerIds } from '../map/style';
import { featureLines, snapToRoads, type RoadSnap } from '../nav/roadSnap';
import type { LngLat, Mode } from '../types';

// A pozíció körül ekkora (képpontban, fél oldalhossz) négyzetben keressük a térképen látható utakat
// (18,5-ös zoomon ~0,15 m/px → bőven a ROAD_SNAP_MAX_M felett)
const QUERY_HALF_PX = 180;

/** Egy GPS-pozíció illesztésének eredménye: a bemeneti pozíció és a hozzá tartozó útpont (null = nincs közeli út). */
export interface ResolvedSnap {
  pos: LngLat;
  snap: RoadSnap | null;
}

/**
 * Útvonal nélkül, haladás közben: minden új pozíciót a térképen látható legközelebbi, menetirányba eső útra illeszt.
 * Csak a lekérdezés végén ad új eredményt (a nyers és az illesztett pont között ne ugráljon a jelölő).
 */
export function useRoadSnap(
  mapRef: RefObject<MapRef | null>,
  pos: LngLat | null,
  heading: number | null,
  active: boolean,
  mode: Mode,
): ResolvedSnap | null {
  const [resolved, setResolved] = useState<ResolvedSnap | null>(null);
  const headingRef = useRef(heading);
  headingRef.current = heading;
  useEffect(() => {
    if (!active || !pos) {
      setResolved(null);
      return;
    }
    let stale = false;
    const map = mapRef.current;
    const done = (snap: RoadSnap | null) => {
      if (!stale) setResolved({ pos, snap });
    };
    if (!map) {
      done(null);
      return;
    }
    map
      .project(pos)
      .then(([x, y]) =>
        map.queryRenderedFeatures(
          [
            [x - QUERY_HALF_PX, y - QUERY_HALF_PX],
            [x + QUERY_HALF_PX, y + QUERY_HALF_PX],
          ],
          { layers: roadLayerIds(mode) },
        ),
      )
      .then((features) => done(snapToRoads(pos, headingRef.current, featureLines(features))))
      .catch(() => done(null)); // (még) nincs térkép: illesztés nélkül
    return () => {
      stale = true;
    };
  }, [mapRef, pos, active, mode]);
  return active ? resolved : null;
}
