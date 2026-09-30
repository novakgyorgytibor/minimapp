export type LngLat = [number, number];

export type Mode = 'auto' | 'bicycle' | 'pedestrian';
export const MODES: Mode[] = ['auto', 'bicycle', 'pedestrian'];

export interface Lane {
  /** OSRM lane indications, pl. ['straight', 'slight right']. */
  indications: string[];
  /** Ez a sáv jó az útvonalhoz. */
  valid: boolean;
}

export interface Step {
  /** OSRM maneuver type: depart, turn, new name, continue, merge, on ramp, off ramp, fork,
   * end of road, roundabout, rotary, exit roundabout, exit rotary, notification, arrive. */
  kind: string;
  /** uturn, sharp right, right, slight right, straight, slight left, left, sharp left */
  modifier?: string;
  instruction: string;
  streetNames: string[];
  /** Útszám(ok), pl. "M7" vagy "M0; E 60". */
  ref?: string;
  /** Táblaszöveg, pl. "M7, M1: Győr, Bécs-Wien". */
  destinations?: string;
  exitNumber?: string;
  /** Körforgalom: hányadik kijárat. */
  roundaboutExit?: number;
  /** Sávok a manőverpontnál (ha fel van térképezve). */
  lanes?: Lane[];
  /** Index a Route.coords tömbben, ahol a manőver kezdődik. */
  beginIndex: number;
  /** Távolság az útvonal elejétől a manőverig (m). */
  beginDistM: number;
}

export interface Route {
  coords: LngLat[];
  /** cumDistM[i] = távolság az útvonal elejétől coords[i]-ig (m). */
  cumDistM: number[];
  distanceM: number;
  durationS: number;
  steps: Step[];
  /** [west, south, east, north] */
  bbox: [number, number, number, number];
  /** Érint-e útdíjas (fizetős) szakaszt. */
  hasToll?: boolean;
}

export interface Place {
  name: string;
  detail: string;
  coord: LngLat;
}
