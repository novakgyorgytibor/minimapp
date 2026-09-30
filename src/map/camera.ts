import type { CameraRef, CameraStop } from '@maplibre/maplibre-react-native';
import { config } from '../config';
import type { Phase } from '../nav/navMachine';
import type { LngLat } from '../types';

export interface CameraInput {
  phase: Phase;
  pos: LngLat | null;
  heading: number;
  bbox: [number, number, number, number] | null;
  follow: boolean;
}

export function cameraFor({ phase, pos, heading, bbox, follow }: CameraInput): CameraStop | null {
  if (!follow) return null;
  if (phase === 'preview' && bbox) {
    return { bounds: bbox, padding: { top: 140, bottom: 260, left: 48, right: 48 }, bearing: 0, pitch: 0, duration: 800 };
  }
  if (!pos) return null;
  if (phase === 'navigating' || phase === 'rerouting' || phase === 'arrived') {
    return {
      center: pos,
      zoom: config.navZoom,
      bearing: heading,
      pitch: 45,
      padding: { top: 320, bottom: 0, left: 0, right: 0 },
      duration: 1000,
      easing: 'linear',
    };
  }
  return { center: pos, zoom: config.idleZoom, bearing: 0, pitch: 0, duration: 800 };
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
