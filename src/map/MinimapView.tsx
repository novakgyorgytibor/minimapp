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
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, StyleSheet } from 'react-native';
import { config } from '../config';
import type { MaskFeature } from '../nav/corridor';
import { theme } from '../theme';
import type { LngLat, Mode } from '../types';
import { applyCameraStop, NAV_CAMERA_MS } from './camera';
import { lerpPose, shouldGlide, type MarkerPose } from './markerAnim';
import { pulseOpacity } from './pulse';
import { mapStyle, PATH_LAYER_ID, pathOpacity } from './style';

export interface MinimapViewProps {
  masks: MaskFeature[];
  route: LngLat[] | null;
  /** Navigáció közben a megtett rész (halványszürkén takarja a fehér vonalat): ritkán frissülő durva rész + pontos vége. */
  routeDone: { coarse: LngLat[] | null; tail: LngLat[] | null };
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
// A megtett rész: tömör halványszürke (≈ 35% fehér feketén), kicsit szélesebb, hogy a fehér vonal széle se látsszon ki.
// Az előttünk álló rész így átmenet nélkül, tisztán fehér marad.
const DONE_PAINT: LineLayerSpecification['paint'] = {
  'line-color': '#595959',
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, 4, 16, 7.5, 19, 11.5],
};
const DONE_LAYOUT: LineLayerSpecification['layout'] = { 'line-cap': 'butt', 'line-join': 'round' };
// Az útvonal kerek kezdő vége kilógna a szürke (butt végű) megtett rész mögül → szürke kupak rá (sugár = a szürke vonal fele)
const DONE_CAP_PAINT = {
  'circle-color': '#595959',
  'circle-radius': ['interpolate', ['linear'], ['zoom'], 10, 2, 16, 3.75, 19, 5.75],
} as const;

const RouteLayer = memo(function RouteLayer({ coords }: { coords: LngLat[] | null }) {
  const data = useMemo(() => (coords && coords.length > 1 ? lineFeature(coords) : EMPTY), [coords]);
  return (
    <GeoJSONSource id="route" data={data}>
      <Layer type="line" id="route" source="route" layout={ROUTE_LAYOUT} paint={ROUTE_PAINT} />
    </GeoJSONSource>
  );
});

const DoneLayer = memo(function DoneLayer({ id, coords }: { id: string; coords: LngLat[] | null }) {
  const data = useMemo(() => (coords && coords.length > 1 ? lineFeature(coords) : EMPTY), [coords]);
  return (
    <GeoJSONSource id={id} data={data}>
      <Layer type="line" id={id} source={id} layout={DONE_LAYOUT} paint={DONE_PAINT} />
    </GeoJSONSource>
  );
});

const PULSE_MS = 2600;
const PULSE_TICK_MS = 66; // ~15 fps elég a lassú pulzáláshoz
// Nagyobb érintési terület a vékony vonal körül
const ALT_HITBOX = { top: 22, right: 22, bottom: 22, left: 22 };

// A másik útvonal a fő útvonal ALATT (beforeId), koppintásra kiválasztható
const AltLayer = memo(function AltLayer({ coords, onPress }: { coords: LngLat[] | null; onPress: () => void }) {
  const data = useMemo(() => (coords && coords.length > 1 ? lineFeature(coords) : EMPTY), [coords]);
  // Lassú pulzálás, hogy feltűnjön és koppintásra ösztönözzön; csak ha van alternatíva
  const [opacity, setOpacity] = useState(0.3);
  const active = !!coords && coords.length > 1;
  useEffect(() => {
    if (!active) return;
    const t0 = Date.now();
    const id = setInterval(() => setOpacity(pulseOpacity(Date.now() - t0, PULSE_MS, 0.2, 0.55)), PULSE_TICK_MS);
    return () => clearInterval(id);
  }, [active]);
  const paint = useMemo<LineLayerSpecification['paint']>(() => ({ ...ROUTE_PAINT, 'line-opacity': opacity }), [opacity]);
  return (
    <GeoJSONSource id="route-alt" data={data} onPress={onPress} hitbox={ALT_HITBOX}>
      <Layer type="line" id="route-alt" source="route-alt" beforeId="route" layout={ROUTE_LAYOUT} paint={paint} />
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

const MARKER_TICK_MS = 1000 / config.mapFps;

// A saját pozíció: mindig háromszög; amíg nincs irány (pl. szimulátorban állva), észak felé mutat.
// Új mérésnél nem ugrik, hanem a kamerával együtt (ugyanannyi idő alatt, egyenletesen) csúszik oda,
// így követés közben a képernyőn egy helyben marad. Csak a csúszás alatt fut az időzítő.
const MeLayer = memo(function MeLayer({ coord, heading }: { coord: LngLat | null; heading: number | null }) {
  const [pose, setPose] = useState<MarkerPose | null>(coord ? { pos: coord, bearing: heading ?? 0 } : null);
  const shown = useRef(pose);
  shown.current = pose;
  useEffect(() => {
    if (!coord) {
      setPose(null);
      return;
    }
    const to: MarkerPose = { pos: coord, bearing: heading ?? 0 };
    const from = shown.current;
    if (!from || !shouldGlide(from.pos, to.pos)) {
      setPose(to);
      return;
    }
    const t0 = Date.now();
    const id = setInterval(() => {
      const f = (Date.now() - t0) / NAV_CAMERA_MS;
      setPose(lerpPose(from, to, f));
      if (f >= 1) clearInterval(id);
    }, MARKER_TICK_MS);
    return () => clearInterval(id);
  }, [coord, heading]);
  const data = useMemo(
    () =>
      pose
        ? ({ type: 'Feature', properties: { bearing: pose.bearing }, geometry: { type: 'Point', coordinates: pose.pos } } as Feature<Point>)
        : EMPTY,
    [pose],
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
  // Az útvonal első pontja (stabil hivatkozás), amint van megtett rész
  const doneStart = route && (routeDone.coarse?.length || routeDone.tail?.length) ? route[0] : null;
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
      <DoneLayer id="route-done-coarse" coords={routeDone.coarse} />
      <DoneLayer id="route-done-tail" coords={routeDone.tail} />
      <PointLayer id="route-done-cap" coord={doneStart} paint={DONE_CAP_PAINT} />
      <ManeuverLayer data={maneuvers} />
      {masks.map((m, i) => (
        <MaskLayer key={`mask-${i}`} index={i} data={m} />
      ))}
      {/* A maszkok UTÁN kerül fel (beforeId=route): a maszkok fölött, a kiválasztott útvonal alatt – nem takarja semmi */}
      <AltLayer coords={alt} onPress={onSelectAlt} />
      <PointLayer id="dest" coord={dest} paint={DEST_PAINT} />
      <MeLayer coord={pos} heading={heading} />
    </Map>
  );
}
