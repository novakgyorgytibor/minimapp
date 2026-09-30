import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
  type CameraStop,
  type LineLayerSpecification,
  type SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { memo, useEffect, useMemo, useRef } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { config } from '../config';
import type { MaskFeature } from '../nav/corridor';
import { theme } from '../theme';
import type { LngLat, Mode } from '../types';
import { applyCameraStop } from './camera';
import { mapStyle, PATH_LAYER_ID, pathOpacity } from './style';

export interface MinimapViewProps {
  masks: MaskFeature[];
  route: LngLat[] | null;
  /** A már megtett útvonalrész (halványabban). */
  routeDone: LngLat[] | null;
  /** Előnézetben a másik útvonal (halványan, koppintható). */
  alt: LngLat[] | null;
  onSelectAlt: () => void;
  /** Vastagabb szakaszok a valódi manőverek körül. */
  maneuvers: FeatureCollection<LineString> | null;
  pos: LngLat | null;
  /** Irány fokban; null = még nincs → a háromszög észak felé mutat. */
  heading: number | null;
  dest: LngLat | null;
  camera: CameraStop | null;
  onLongPress: (coord: LngLat) => void;
  onUserPan: () => void;
  /** A képernyő közepe, a zoom és a térkép forgatása (húzás / zoomolás közben is folyamatosan). */
  onViewChange: (center: LngLat, zoom: number, bearing: number) => void;
  /** Minden növelésre a térkép (a mostani középponttal) északra fordul. */
  northNonce: number;
  /** Minden növelésre a kamera akkor is újra alkalmazza a stopot, ha az nem változott (✕ / Mégse). */
  recenterNonce: number;
  /** Közlekedési mód: autóval a járdák/gyalogutak halványabbak. */
  mode: Mode;
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

const DONE_PAINT: LineLayerSpecification['paint'] = { ...ROUTE_PAINT, 'line-opacity': 0.35 };

const DoneLayer = memo(function DoneLayer({ coords }: { coords: LngLat[] | null }) {
  const data = useMemo(() => (coords && coords.length > 1 ? lineFeature(coords) : EMPTY), [coords]);
  return (
    <GeoJSONSource id="route-done" data={data}>
      <Layer type="line" id="route-done" source="route-done" layout={ROUTE_LAYOUT} paint={DONE_PAINT} />
    </GeoJSONSource>
  );
});

const ALT_PAINT: LineLayerSpecification['paint'] = { ...ROUTE_PAINT, 'line-opacity': 0.3 };
// Nagyobb érintési terület a vékony vonal körül
const ALT_HITBOX = { top: 22, right: 22, bottom: 22, left: 22 };

// A másik útvonal a fő útvonal ALATT (beforeId), koppintásra kiválasztható
const AltLayer = memo(function AltLayer({ coords, onPress }: { coords: LngLat[] | null; onPress: () => void }) {
  const data = useMemo(() => (coords && coords.length > 1 ? lineFeature(coords) : EMPTY), [coords]);
  return (
    <GeoJSONSource id="route-alt" data={data} onPress={onPress} hitbox={ALT_HITBOX}>
      <Layer type="line" id="route-alt" source="route-alt" beforeId="route" layout={ROUTE_LAYOUT} paint={ALT_PAINT} />
    </GeoJSONSource>
  );
});

const MANEUVER_PAINT: LineLayerSpecification['paint'] = {
  'line-color': theme.fg,
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 5, 16, 11, 19, 18],
};

const ManeuverLayer = memo(function ManeuverLayer({ data }: { data: FeatureCollection<LineString> | null }) {
  return (
    <GeoJSONSource id="route-maneuvers" data={data ?? EMPTY}>
      <Layer type="line" id="route-maneuvers" source="route-maneuvers" layout={ROUTE_LAYOUT} paint={MANEUVER_PAINT} />
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

const ARROW_IMAGES = { 'heading-arrow': require('../../assets/heading-arrow.png') };
const ARROW_LAYOUT: SymbolLayerSpecification['layout'] = {
  'icon-image': 'heading-arrow',
  'icon-rotate': ['get', 'bearing'],
  'icon-rotation-alignment': 'map',
  'icon-pitch-alignment': 'map',
  'icon-allow-overlap': true,
  'icon-ignore-placement': true,
};

// A saját pozíció: mindig háromszög; amíg nincs irány (pl. szimulátorban állva), észak felé mutat.
const MeLayer = memo(function MeLayer({ coord, heading }: { coord: LngLat | null; heading: number | null }) {
  const data = useMemo(
    () =>
      coord
        ? ({ type: 'Feature', properties: { bearing: heading ?? 0 }, geometry: { type: 'Point', coordinates: coord } } as Feature<Point>)
        : EMPTY,
    [coord, heading],
  );
  return (
    <GeoJSONSource id="me" data={data}>
      <Layer type="symbol" id="me-arrow" source="me" layout={ARROW_LAYOUT} />
    </GeoJSONSource>
  );
});

// A stílus meglévő 'roads-path' rétegét módosítja (azonos id → a MapLibre a meglévő réteget frissíti)
const PathStyle = memo(function PathStyle({ mode }: { mode: Mode }) {
  const paint = useMemo(() => ({ 'line-opacity': pathOpacity(mode) }), [mode]);
  return <Layer type="line" id={PATH_LAYER_ID} paint={paint} />;
});

const PointLayer = memo(function PointLayer({ id, coord, paint }: { id: string; coord: LngLat | null; paint: object }) {
  const data = useMemo(() => (coord ? pointFeature(coord) : EMPTY), [coord]);
  return (
    <GeoJSONSource id={id} data={data}>
      <Layer type="circle" id={id} source={id} paint={paint as never} />
    </GeoJSONSource>
  );
});

export function MinimapView({ masks, route, routeDone, alt, onSelectAlt, maneuvers, pos, heading, dest, camera, onLongPress, onUserPan, onViewChange, northNonce, recenterNonce, mode }: MinimapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const cameraKey = camera ? JSON.stringify(camera) : null;
  const latestCamera = useRef(camera);
  latestCamera.current = camera;
  useEffect(() => {
    if (camera && cameraRef.current) applyCameraStop(cameraRef.current, camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, recenterNonce]);
  const lastCenter = useRef<LngLat | null>(null);
  useEffect(() => {
    if (northNonce > 0 && lastCenter.current) {
      cameraRef.current?.easeTo({ center: lastCenter.current, bearing: 0, duration: 300 });
    }
  }, [northNonce]);
  const onRegion = (center: LngLat, zoom: number, bearing: number) => {
    lastCenter.current = center;
    onViewChange(center, zoom, bearing);
  };
  // A térkép betöltése előtt kiadott parancs elveszhet → betöltéskor újra alkalmazzuk.
  const onMapLoaded = () => {
    if (latestCamera.current && cameraRef.current) applyCameraStop(cameraRef.current, latestCamera.current);
  };

  return (
    <Map
      style={StyleSheet.absoluteFill}
      mapStyle={mapStyle}
      attribution={false}
      logo={false}
      compass={false}
      scaleBar={false}
      touchPitch={false}
      preferredFramesPerSecond={config.mapFps}
      onDidFinishLoadingMap={onMapLoaded}
      onPress={() => Keyboard.dismiss()}
      onLongPress={(e) => onLongPress(e.nativeEvent.lngLat)}
      onRegionWillChange={(e) => {
        if (e.nativeEvent.userInteraction) onUserPan();
      }}
      onRegionIsChanging={(e) => onRegion(e.nativeEvent.center, e.nativeEvent.zoom, e.nativeEvent.bearing)}
      onRegionDidChange={(e) => onRegion(e.nativeEvent.center, e.nativeEvent.zoom, e.nativeEvent.bearing)}
    >
      <Camera ref={cameraRef} />
      <Images images={ARROW_IMAGES} />
      <PathStyle mode={mode} />
      <RouteLayer coords={route} />
      <DoneLayer coords={routeDone} />
      <AltLayer coords={alt} onPress={onSelectAlt} />
      <ManeuverLayer data={maneuvers} />
      {masks.map((m, i) => (
        <MaskLayer key={`mask-${i}`} index={i} data={m} />
      ))}
      <PointLayer id="dest" coord={dest} paint={DEST_PAINT} />
      <MeLayer coord={pos} heading={heading} />
    </Map>
  );
}
