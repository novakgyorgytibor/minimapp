import { config } from '../config';

export interface LocationOptions {
  accuracy: 'navigation' | 'balanced';
  timeInterval: number;
  distanceInterval: number;
}

/** Akkukímélés: legnagyobb GPS-pontosság csak navigáció közben, egyébként kiegyensúlyozott és ritkább. */
export function locationOptions(navigating: boolean): LocationOptions {
  return navigating ? config.gpsNavigating : config.gpsIdle;
}
