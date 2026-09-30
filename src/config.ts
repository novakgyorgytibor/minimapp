import type { Mode } from './types';

export const config = {
  tileJsonUrl: 'https://tiles.openfreemap.org/planet',
  valhallaUrl: 'https://valhalla1.openstreetmap.de/route',
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  userAgent: 'minimap/0.1 (personal open-source navigation app)',

  httpTimeoutMs: 10_000,
  httpRetries: 3,
  nominatimMinIntervalMs: 1_000,
  searchDebounceMs: 400,
  searchMinChars: 3,

  // Halványítás a képernyőhöz mérten: a maszk-sugarak = arányok × külső sugár,
  // külső sugár = képernyőszélesség × az alábbi arány (így bármelyik zoomon ugyanúgy néz ki).
  maskFractions: [1 / 6, 2 / 6, 3 / 6, 4 / 6, 5 / 6, 1],
  maskOpacities: [0.2, 0.2, 0.2, 0.2, 0.2, 1],
  idleFadeScreenFraction: 0.5,
  corridorFadeScreenFraction: 0.3,

  offRouteM: { auto: 40, bicycle: 40, pedestrian: 25 } as Record<Mode, number>,
  offRouteSamples: 3,
  rerouteMinIntervalMs: 10_000,
  arrivalM: 20,
  arrivedResetMs: 5_000,

  // Akkukímélés
  gpsNavigating: { accuracy: 'navigation', timeInterval: 1000, distanceInterval: 2 } as const,
  gpsIdle: { accuracy: 'balanced', timeInterval: 5000, distanceInterval: 10 } as const,
  mapFps: 30,
  idleCameraStepM: 5,

  idleZoom: 18,
  navZoom: 18.5,
  courseMinSpeedMps: 2,
} as const;
