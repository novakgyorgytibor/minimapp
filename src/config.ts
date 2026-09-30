import { fadeSteps } from './map/fade';
import type { Mode } from './types';

const FADE = fadeSteps(12);

export const config = {
  tileJsonUrl: 'https://tiles.openfreemap.org/planet',
  valhallaUrl: 'https://valhalla1.openstreetmap.de/route',
  valhallaTraceUrl: 'https://valhalla1.openstreetmap.de/trace_attributes',
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  photonUrl: 'https://photon.komoot.io/api/',
  userAgent: 'minimap/0.1 (personal open-source navigation app)',

  httpTimeoutMs: 10_000,
  httpRetries: 3,
  nominatimMinIntervalMs: 1_000,
  photonMinIntervalMs: 500,
  searchDebounceMs: 400,
  searchMinChars: 3,

  // Halványítás a képernyőhöz mérten: a maszk-sugarak = arányok × külső sugár,
  // külső sugár = képernyőszélesség × az alábbi arány (így bármelyik zoomon ugyanúgy néz ki).
  // 12 lépcső, lágy S-görbe szerinti sötétedés (lásd map/fade.ts) – ne látsszon éles kör
  maskFractions: FADE.fractions,
  maskOpacities: FADE.opacities,
  idleFadeScreenFraction: 0.5,
  corridorFadeScreenFraction: 0.3,

  offRouteM: { auto: 40, bicycle: 40, pedestrian: 25 } as Record<Mode, number>,
  offRouteSamples: 3,
  rerouteMinIntervalMs: 10_000,
  arrivalM: 20,
  arrivedResetMs: 5_000,

  // Akkukímélés
  gpsNavigating: { accuracy: 'navigation', timeInterval: 1000, distanceInterval: 2 } as const,
  // Androidon a 'balanced' Wi-Fi/cella alapú és több tíz métert ugrál → alapnézetben is GPS, csak ritkábban
  gpsIdle: { accuracy: 'high', timeInterval: 5000, distanceInterval: 10 } as const,
  mapFps: 30,
  idleCameraStepM: 5,

  idleZoom: 18,
  navZoom: 18.5,
  courseMinSpeedMps: 2,
} as const;
