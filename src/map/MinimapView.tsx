import { Camera, GeoJSONSource, Layer, Map, type CameraStop } from '@maplibre/maplibre-react-native';
import type { Feature, LineString, Point } from 'geojson';
import { StyleSheet } from 'react-native';
import { config } from '../config';
import type { MaskFeature } from '../nav/corridor';
import { theme } from '../theme';
import type { LngLat } from '../types';
import { mapStyle } from './style';

export interface MinimapViewProps {
  masks: MaskFeature[];
  route: LngLat[] | null;
  pos: LngLat | null;
  dest: LngLat | null;
  camera: CameraStop | null;
  onLongPress: (coord: LngLat) => void;
  onUserPan: () => void;
}

const EMPTY: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
const pointFeature = (c: LngLat): Feature<Point> => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } });
const lineFeature = (c: LngLat[]): Feature<LineString> => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: c } });

export function MinimapView({ masks, route, pos, dest, camera, onLongPress, onUserPan }: MinimapViewProps) {
  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      attribution={false}
      logo={false}
      compass={false}
      scaleBar={false}
      touchPitch={false}
      onLongPress={(e) => onLongPress(e.nativeEvent.lngLat)}
      onRegionWillChange={(e) => {
        if (e.nativeEvent.userInteraction) onUserPan();
      }}
    >
      <Camera {...(camera ?? {})} />

      {masks.map((m, i) => (
        <GeoJSONSource key={`mask-${i}`} id={`mask-${i}`} data={m}>
          <Layer
            type="fill"
            id={`mask-${i}`}
            source={`mask-${i}`}
            paint={{ 'fill-color': theme.bg, 'fill-opacity': config.maskOpacities[i] ?? 1, 'fill-antialias': false }}
          />
        </GeoJSONSource>
      ))}

      <GeoJSONSource id="route" data={route && route.length > 1 ? lineFeature(route) : EMPTY}>
        <Layer
          type="line"
          id="route"
          source="route"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': theme.fg,
            'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6, 19, 10],
          }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="dest" data={dest ? pointFeature(dest) : EMPTY}>
        <Layer
          type="circle"
          id="dest"
          source="dest"
          paint={{ 'circle-radius': 7, 'circle-color': theme.bg, 'circle-stroke-color': theme.fg, 'circle-stroke-width': 2 }}
        />
      </GeoJSONSource>

      <GeoJSONSource id="me" data={pos ? pointFeature(pos) : EMPTY}>
        <Layer
          type="circle"
          id="me"
          source="me"
          paint={{ 'circle-radius': 7, 'circle-color': theme.fg, 'circle-stroke-color': theme.bg, 'circle-stroke-width': 2 }}
        />
      </GeoJSONSource>
    </Map>
  );
}
