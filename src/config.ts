import { fadeSteps } from './map/fade';
import type { Mode } from './types';

const FADE = fadeSteps(12);

export const config = {
  tileJsonUrl: 'https://tiles.openfreemap.org/planet',
  valhallaUrl: 'https://valhalla1.openstreetmap.de/route',
  valhallaTraceUrl: 'https://valhalla1.openstreetmap.de/trace_attributes',
  nominatimUrl: 'https://nominatim.openstreetmap.org/search',
  photonUrl: 'https://photon.komoot.io/api/',
  // Weboldal (website/, Vercelen; rövid címek a vercel.json-ban: /privacy, /contact, /coffee) és a kapcsolat
  websiteUrl: 'https://theminimapp.vercel.app',
  // Az offline letöltéshez kell egy stílus-URL (a beépített stílus nem URL); ugyanazt a csempeforrást
  // hivatkozza, mint a térkép, rétegek nélkül (website/offline-style.json)
  offlineStyleUrl: 'https://theminimapp.vercel.app/offline-style.json',
  contactEmail: 'novak.gyorgy.tibor@gmail.com',
  revolutTag: 'gyrgyfrwj',
  userAgent: 'minimap/0.1 (personal open-source navigation app)',

  // Navigáció indulásakor az útvonal körüli csempék letöltődnek → net nélkül is megvan a térkép.
  // A forrás csak 14-es zoomig ad csempét, a közelebbi nézet ebből nagyít.
  offlineMinZoom: 12,
  offlineMaxZoom: 14,
  offlineChunkM: 2_000,
  offlinePadM: 500,
  // Ennyi legutóbbi útvonal csomagjai maradnak meg (újratervezésnél a régi is kellhet még)
  offlineKeepRoutes: 3,

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

  // Gyalog lassú a haladás, és egy rossz utca/oldal is gyorsan számít → kisebb küszöb, kevesebb minta, gyakoribb újratervezés
  offRouteM: { auto: 40, bicycle: 40, pedestrian: 15 } as Record<Mode, number>,
  offRouteSamples: { auto: 3, bicycle: 3, pedestrian: 2 } as Record<Mode, number>,
  rerouteMinIntervalMs: { auto: 10_000, bicycle: 10_000, pedestrian: 5_000 } as Record<Mode, number>,
  // A letérést a nyers GPS-ből nézzük (a simított pozíció gyalogtempónál késik); ennél pontatlanabb mérésnél a simítottból
  offRouteRawMaxAccuracyM: 25,
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
