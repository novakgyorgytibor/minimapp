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

  maskRadiiM: [50, 100, 150, 200, 250, 300],
  maskOpacities: [0.2, 0.2, 0.2, 0.2, 0.2, 1],
  idleMaskMoveM: 10,

  offRouteM: { auto: 40, bicycle: 40, pedestrian: 25 } as Record<Mode, number>,
  offRouteSamples: 3,
  rerouteMinIntervalMs: 10_000,
  arrivalM: 20,
  arrivedResetMs: 5_000,

  idleZoom: 17,
  navZoom: 18,
  courseMinSpeedMps: 2,
} as const;
