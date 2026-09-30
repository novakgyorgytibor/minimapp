export type LngLat = [number, number];

export type Mode = 'auto' | 'bicycle' | 'pedestrian';
export const MODES: Mode[] = ['auto', 'bicycle', 'pedestrian'];

export interface Step {
  /** Valhalla maneuver type (https://valhalla.github.io/valhalla/api/turn-by-turn/api-reference/) */
  type: number;
  instruction: string;
  streetNames: string[];
  roundaboutExitCount?: number;
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
}

export interface Place {
  name: string;
  detail: string;
  coord: LngLat;
}
