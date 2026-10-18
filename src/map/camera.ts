import type { CameraRef, CameraStop } from '@maplibre/maplibre-react-native';
import { config } from '../config';
import type { Phase } from '../nav/navMachine';
import { pointAlong, routeBearingAt } from '../nav/predict';
import type { LngLat, Route } from '../types';

// Kifejezetten nullázni kell: az előnézet paddingje különben megmaradna, és elcsúsztatná a középre állást.
const NO_PADDING = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * Navigáció közben a kamera ennyi idő alatt csúszik az új (előrebecsült) pozícióra, a jelölő is ugyanígy.
 * Kicsit hosszabb, mint a GPS 1 s-os üteme: a következő mérés még menet közben érkezik, így nincs megállás.
 */
export const NAV_CAMERA_MS = 1200;
const IDLE_CAMERA_MS = 800;
/** A navigációs nézet dőlése (fok). */
export const NAV_PITCH_DEG = 60;
/**
 * Navigáció közben a nyíl nem a képernyő közepén, hanem lejjebb áll (a felső padding a képernyőmagasság ekkora
 * része → a nyíl (1 + f) / 2 magasságban): előre többet látni, hátra kevesebbet, mint az autós szemszögéből.
 */
export const NAV_TOP_PADDING_FRACTION = 0.3;

export function navPadding(heightPt: number) {
  return { top: Math.round(NAV_TOP_PADDING_FRACTION * heightPt), bottom: 0, left: 0, right: 0 };
}

/**
 * Gyorsabban haladva kijjebb zoomol (a sebesség és a megengedett sebesség közül a nagyobb számít, így pl.
 * autópályán egy rövid lassításra nem ugrik vissza). Csökkenő sorrendben: ettől a km/h-tól ez a zoom.
 */
const SPEED_ZOOMS: readonly { fromKmh: number; zoom: number }[] = [
  { fromKmh: 100, zoom: 17 },
  { fromKmh: 80, zoom: 17.5 },
  { fromKmh: 60, zoom: 18 },
];
/** Visszazoomolni csak ennyivel a küszöb alatt (ne ugráljon a határon). */
export const SPEED_ZOOM_HYSTERESIS_KMH = 8;

function zoomForKmh(kmh: number): number {
  return SPEED_ZOOMS.find((z) => kmh >= z.fromKmh)?.zoom ?? config.navZoom;
}

/** A navigációs zoom az előzőből: kijjebb azonnal, vissza (befelé) csak a hiszterézisen túl. */
export function nextSpeedZoom(prev: number, kmh: number): number {
  const z = zoomForKmh(kmh);
  if (z <= prev) return z;
  return Math.max(prev, zoomForKmh(kmh + SPEED_ZOOM_HYSTERESIS_KMH));
}

/**
 * Útvonalkövetés (autóval, az útvonalon): a kamera nem egyenesen csúszik a következő célpontig (kanyarban levágná
 * az ívet, és a nyíl oldalazva venné be), hanem FOLLOW_TICK_MS-onként egy-egy rövid (FOLLOW_EASE_MS) lépéssel
 * az útvonal mentén halad, az útvonal irányába fordulva. A lépés kicsit hosszabb az ütemnél → nincs megállás.
 */
export const FOLLOW_TICK_MS = 200;
export const FOLLOW_EASE_MS = 250;
// Ekkora szakaszon fordul a kamera egy töréspontnál (elsimított kanyar)
const FOLLOW_BEARING_WINDOW_M = 12;

/** A megtett táv csúszása: fromM-ről toM-re NAV_CAMERA_MS alatt, egyenletesen (t0-tól). */
export interface AlongGlide {
  route: Route;
  fromM: number;
  toM: number;
  t0: number;
}

export function alongAt(g: AlongGlide, t: number): number {
  const f = Math.min(Math.max((t - g.t0) / NAV_CAMERA_MS, 0), 1);
  return g.fromM + f * (g.toM - g.fromM);
}

/** A kamera következő lépése a d távolságnál lévő útvonalpontra; bearing: az útvonal iránya ott. */
export function routeFollowStep(
  route: Route,
  d: number,
  northUp: boolean,
  view: { zoom: number; heightPt: number },
): { stop: CameraStop; bearing: number } {
  const bearing = routeBearingAt(route, d, FOLLOW_BEARING_WINDOW_M);
  return {
    bearing,
    stop: {
      center: pointAlong(route, d),
      zoom: view.zoom,
      bearing: northUp ? 0 : bearing,
      pitch: NAV_PITCH_DEG,
      padding: navPadding(view.heightPt),
      duration: FOLLOW_EASE_MS,
      easing: 'linear',
    },
  };
}

export interface CameraInput {
  phase: Phase;
  pos: LngLat | null;
  heading: number;
  bbox: [number, number, number, number] | null;
  follow: boolean;
  /** Navigáció közben is észak legyen felül (a tájolóra koppintva kapcsolható). */
  northUp: boolean;
  /** Útvonal nélkül, haladás közben: a navigációhoz hasonlóan menetirányba fordulva, döntve követ. */
  rolling?: boolean;
  /** Navigációs zoom (sebességfüggő, lásd nextSpeedZoom). */
  navZoom?: number;
  /** A térkép magassága (pont) – ebből a navigációs nézet felső paddingje. */
  heightPt?: number;
}

export function cameraFor({ phase, pos, heading, bbox, follow, northUp, rolling = false, navZoom = config.navZoom, heightPt = 0 }: CameraInput): CameraStop | null {
  if (!follow) return null;
  // Előnézetben mindig az útvonalválasztós nézet (a ◎ is ide áll vissza)
  if (phase === 'preview' && bbox) {
    return { bounds: bbox, padding: { top: 140, bottom: 260, left: 48, right: 48 }, bearing: 0, pitch: 0, duration: 800 };
  }
  if (!pos) return null;
  if (phase === 'navigating' || phase === 'rerouting' || phase === 'arrived' || (phase === 'idle' && rolling)) {
    return {
      center: pos,
      zoom: navZoom,
      bearing: northUp ? 0 : heading,
      pitch: NAV_PITCH_DEG,
      padding: navPadding(heightPt),
      duration: NAV_CAMERA_MS,
      easing: 'linear',
    };
  }
  return { center: pos, zoom: config.idleZoom, bearing: 0, pitch: 0, padding: NO_PADDING, duration: IDLE_CAMERA_MS };
}

/**
 * Imperatívan alkalmazza a stopot. (A deklaratív Camera propok üresre váltásakor – pl. amikor a
 * felhasználó elhúzza a térképet – a natív oldal ugratná a nézetet.)
 */
export function applyCameraStop(ref: Pick<CameraRef, 'easeTo' | 'fitBounds'>, stop: CameraStop): void {
  if ('bounds' in stop && stop.bounds) {
    const { bounds, ...options } = stop;
    ref.fitBounds(bounds, options);
  } else if ('center' in stop && stop.center) {
    ref.easeTo(stop);
  }
}

export type MaskMode = 'route' | 'center' | 'none';

/**
 * Útvonal követése közben a folyosó; ha a felhasználó elhúzta a térképet (vagy nincs útvonal),
 * a képernyő közepe körüli kör; nézet nélkül minden fekete.
 */
export function maskMode({ hasRoute, follow, hasView }: { hasRoute: boolean; follow: boolean; hasView: boolean }): MaskMode {
  if (hasRoute && follow) return 'route';
  return hasView ? 'center' : 'none';
}
