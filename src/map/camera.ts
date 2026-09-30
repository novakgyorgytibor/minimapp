import type { CameraStop } from '@maplibre/maplibre-react-native';
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
      zoom: 17,
      bearing: heading,
      pitch: 45,
      padding: { top: 320, bottom: 0, left: 0, right: 0 },
      duration: 1000,
      easing: 'linear',
    };
  }
  return { center: pos, zoom: 15, bearing: 0, pitch: 0, duration: 800 };
}
