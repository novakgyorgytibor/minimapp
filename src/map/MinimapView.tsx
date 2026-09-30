import {
  Camera,
  GeoJSONSource,
  Layer,
  Map,
  type CameraRef,
  type CameraStop,
  type LineLayerSpecification,
} from '@maplibre/maplibre-react-native';
import type { Feature, LineString, Point } from 'geojson';
import { memo, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { config } from '../config';
import type { MaskFeature } from '../nav/corridor';
import { theme } from '../theme';
import type { LngLat } from '../types';
import { applyCameraStop } from './camera';
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

const ROUTE_LAYOUT: LineLayerSpecification['layout'] = { 'line-cap': 'round', 'line-join': 'round' };
const ROUTE_PAINT: LineLayerSpecification['paint'] = {
  'line-color': theme.fg,
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 3, 16, 6, 19, 10],
};
const DEST_PAINT = { 'circle-radius': 7, 'circle-color': theme.bg, 'circle-stroke-color': theme.fg, 'circle-stroke-width': 2 } as const;
const ME_PAINT = { 'circle-radius': 7, 'circle-color': theme.fg, 'circle-stroke-color': theme.bg, 'circle-stroke-width': 2 } as const;

// Memoizált rétegek: a nagy GeoJSON csak akkor megy át a natív oldalra, ha tényleg változott
// (nem minden GPS-frissítéskor).
const RouteLayer = memo(function RouteLayer({ coords }: { coords: LngLat[] | null }) {
  const data = useMemo(() => (coords && coords.length > 1 ? lineFeature(coords) : EMPTY), [coords]);
  return (
    <GeoJSONSource id="route" data={data}>
      <Layer type="line" id="route" source="route" layout={ROUTE_LAYOUT} paint={ROUTE_PAINT} />
    </GeoJSONSource>
  );
});

const MaskLayer = memo(function MaskLayer({ index, data }: { index: number; data: MaskFeature }) {
  const id = `mask-${index}`;
  const paint = useMemo(
    () => ({ 'fill-color': theme.bg, 'fill-opacity': config.maskOpacities[index] ?? 1, 'fill-antialias': false }),
    [index],
  );
  // beforeId: a később felkerülő maszk is az útvonal ALÁ kerüljön
  return (
    <GeoJSONSource id={id} data={data}>
      <Layer type="fill" id={id} source={id} beforeId="route" paint={paint} />
    </GeoJSONSource>
  );
});

const PointLayer = memo(function PointLayer({ id, coord, paint }: { id: string; coord: LngLat | null; paint: object }) {
  const data = useMemo(() => (coord ? pointFeature(coord) : EMPTY), [coord]);
  return (
    <GeoJSONSource id={id} data={data}>
      <Layer type="circle" id={id} source={id} paint={paint as never} />
    </GeoJSONSource>
  );
});

export function MinimapView({ masks, route, pos, dest, camera, onLongPress, onUserPan }: MinimapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const cameraKey = camera ? JSON.stringify(camera) : null;
  useEffect(() => {
    if (camera && cameraRef.current) applyCameraStop(cameraRef.current, camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey]);

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
      <Camera ref={cameraRef} />
      <RouteLayer coords={route} />
      {masks.map((m, i) => (
        <MaskLayer key={`mask-${i}`} index={i} data={m} />
      ))}
      <PointLayer id="dest" coord={dest} paint={DEST_PAINT} />
      <PointLayer id="me" coord={pos} paint={ME_PAINT} />
    </Map>
  );
}
