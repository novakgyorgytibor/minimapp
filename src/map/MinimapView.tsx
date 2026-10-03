import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  type CameraRef,
  type CameraStop,
  type MapRef,
  type FilterSpecification,
  type LineLayerSpecification,
  type SymbolLayerSpecification,
} from '@maplibre/maplibre-react-native';
import type { Feature, FeatureCollection, LineString, Point } from 'geojson';
import { memo, type Ref, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Keyboard, StyleSheet, useWindowDimensions, View } from 'react-native';
import { config } from '../config';
import type { MaskFeature } from '../nav/corridor';
import { theme } from '../theme';
import { aheadGeometry, doneGeometry, progressTails } from '../nav/doneGeometry';
import { routeSlice, type TaperedFeatures } from '../nav/maneuverSegments';
import type { LngLat, Mode, Route } from '../types';
import { alongAt, applyCameraStop, FOLLOW_EASE_MS, FOLLOW_TICK_MS, NAV_CAMERA_MS, NAV_PITCH_DEG, routeFollowStep, type AlongGlide } from './camera';
import { lerpPose, MARKER_MAX_GLIDE_M, shouldGlide, type MarkerPose } from './markerAnim';
import { pulseOpacity } from './pulse';
import { mapStyle, PATH_LAYER_ID, pathOpacity } from './style';

export interface MinimapViewProps {
  /** A térkép (pl. a látható utak lekérdezéséhez). */
  mapRef?: Ref<MapRef>;
  masks: MaskFeature[];
  route: LngLat[] | null;
  /** Navigáció közben az útvonal, amelyen a megtett rész (halványszürkén takarja a fehér vonalat) kirajzolódik. */
  doneRoute: Route | null;
  /** A megtett rész vége (m): ugyanaz az előrebecsült pont, ahová a jelölő csúszik; a jelölővel együtt animálva. */
  doneToM: number;
  /** Előnézetben a másik útvonal (halványan, koppintható). */
  alt: LngLat[] | null;
  onSelectAlt: () => void;
  /** Vastagabb szakasz a következő valódi manőver körül (a végein elvékonyodva). */
  maneuvers: TaperedFeatures | null;
  /** Látszik-e a vastagítás (közel a manőverhez lágyan eltűnik). */
  maneuversVisible: boolean;
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
  /**
   * Követő navigáció: a kamera pontosan a jelölő célpontjára csúszik, így a nyíl a képernyő közepén áll
   * (natív animáció, nincs JS-es léptetés) – ilyenkor a térképi jelölő rejtve.
   */
  centerArrow: boolean;
  /** Észak-fent nézet: a középen álló nyíl a menetirányba fordul (különben a térkép fordul, a nyíl felfelé néz). */
  northUp: boolean;
  /**
   * Útvonalkövetés (autóval, az útvonalon, a nyíl középen): a kamera az útvonal mentén halad és annak irányába
   * fordul, a `followToM` megtett távra csúszva (ugyanoda, ahová a megtett rész). null = a `camera` stop érvényes.
   */
  followRoute: Route | null;
  followToM: number;
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

// A még előttünk álló rész fehéren a szürke FÖLÖTT (ahol az útvonal visszafelé ugyanazon az úton halad, ott is fehér)
const AHEAD_LAYOUT: LineLayerSpecification['layout'] = { 'line-cap': 'butt', 'line-join': 'round' };

/**
 * Egy forrás, két réteg: a megtett (szürke) és az előttünk álló (fehér) darab. A `…BeforeId` a korábban
 * felkerült réteg alá teszi az adott réteget (így a második forrás rétegei is a helyükre kerülnek).
 */
const ProgressLayer = memo(function ProgressLayer({
  id,
  done,
  ahead,
  doneBeforeId,
  aheadBeforeId,
}: {
  id: string;
  done: LngLat[] | null;
  ahead: LngLat[] | null;
  doneBeforeId?: string;
  aheadBeforeId?: string;
}) {
  const data = useMemo<FeatureCollection<LineString>>(
    () => ({
      type: 'FeatureCollection',
      features: [
        ...(done && done.length > 1 ? [{ ...lineFeature(done), properties: { part: 'done' } }] : []),
        ...(ahead && ahead.length > 1 ? [{ ...lineFeature(ahead), properties: { part: 'ahead' } }] : []),
      ],
    }),
    [done, ahead],
  );
  return (
    <GeoJSONSource id={id} data={data}>
      <Layer type="line" id={`${id}-done`} source={id} filter={DONE_FILTER} beforeId={doneBeforeId} layout={DONE_LAYOUT} paint={DONE_PAINT} />
      <Layer type="line" id={`${id}-ahead`} source={id} filter={AHEAD_FILTER} beforeId={aheadBeforeId} layout={AHEAD_LAYOUT} paint={ROUTE_PAINT} />
    </GeoJSONSource>
  );
});
const DONE_FILTER: FilterSpecification = ['==', ['get', 'part'], 'done'];
const AHEAD_FILTER: FilterSpecification = ['==', ['get', 'part'], 'ahead'];

const DONE_STEP_M = 200;
/**
 * A megtett rész vége ennyivel előrébb jár a kamera csúszásánál: az új GeoJSON a natív oldalon (csempézés, rajzolás)
 * kb. ennyi késéssel jelenik meg, a kamera viszont késés nélkül mozog. Enélkül nagy sebességnél (100 km/h felett
 * ~3 m) a szürke vége a nyíl mögé csúszna, és mögötte fehér villogna. A maradék ingadozást a nyíl takarja.
 */
const DONE_LEAD_MS = 100;

// A megtett rész vége ugyanazzal a csúszással halad, mint a kamera (alongAt), DONE_LEAD_MS-mal előrébb, így a szürke
// mindig a nyíl alatt végződik. A durva rész csak 200 m-enként változik, csak a rövid vége frissül minden képkockán.
const DoneLayers = memo(function DoneLayers({ route, toM }: { route: Route | null; toM: number }) {
  const [shownM, setShownM] = useState(toM);
  const glide = useRef<AlongGlide | null>(null);
  useEffect(() => {
    if (!route) {
      glide.current = null;
      setShownM(toM);
      return;
    }
    const now = Date.now();
    const prev = glide.current;
    const fromM = prev && prev.route === route ? alongAt(prev, now) : toM;
    // Új útvonalon (újratervezés) vagy nagy ugrásnál nincs csúsztatás
    const g: AlongGlide = { route, fromM: Math.abs(toM - fromM) > MARKER_MAX_GLIDE_M ? toM : fromM, toM, t0: now };
    glide.current = g;
    const tick = () => {
      const t = Date.now() + DONE_LEAD_MS;
      setShownM(alongAt(g, t));
      return t - g.t0 >= NAV_CAMERA_MS;
    };
    if (tick()) return;
    const id = setInterval(() => {
      if (tick()) clearInterval(id);
    }, MARKER_TICK_MS);
    return () => clearInterval(id);
  }, [route, toM]);
  const d = route ? Math.min(Math.max(shownM, 0), route.distanceM) : 0;
  const tails = useMemo(() => (route ? progressTails(route, d, DONE_STEP_M) : null), [route, d]);
  const grid = tails?.grid ?? 0;
  const gridAhead = tails?.gridAhead ?? 0;
  const coarse = useMemo(() => (route && grid > 0 ? doneGeometry(route, grid, DONE_STEP_M).coarse : null), [route, grid]);
  const aheadCoarse = useMemo(() => (route ? aheadGeometry(route, gridAhead, DONE_STEP_M).coarse : null), [route, gridAhead]);
  const tail = tails?.doneTail ?? null;
  const aheadTail = tails?.aheadTail ?? null;
  // Az útvonal kerek kezdő vége kilógna a szürke mögül → szürke kupak az első pontra
  const start = route && d > 0 ? route.coords[0] : null;
  // Sorrend alulról: durva szürke, vég szürke, kupak, durva fehér, vég fehér – minden fehér minden szürke fölött
  return (
    <>
      <ProgressLayer id="route-progress-tail" done={tail} ahead={aheadTail} />
      <ProgressLayer
        id="route-progress-coarse"
        done={coarse}
        ahead={aheadCoarse}
        doneBeforeId="route-progress-tail-done"
        aheadBeforeId="route-progress-tail-ahead"
      />
      <PointLayer id="route-done-cap" coord={start} paint={DONE_CAP_PAINT} beforeId="route-progress-coarse-ahead" />
    </>
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

// A vastagítás darabonként a sima útvonal vastagságától (t = 0) a teljesig (t = 1) – a végek belesimulnak
const widthAt = (route: number, full: number) => ['+', route, ['*', full - route, ['get', 't']]];
const MANEUVER_PAINT: LineLayerSpecification['paint'] = {
  'line-color': theme.fg,
  'line-width': ['interpolate', ['linear'], ['zoom'], 10, widthAt(3, 4), 16, widthAt(6, 8.5), 19, widthAt(10, 14)] as never,
};
const MANEUVER_FADE_MS = 500;

/** A következő manőver kiemelése; megjelenéskor és eltűnéskor lágyan (MANEUVER_FADE_MS alatt) áttűnik. */
const ManeuverLayer = memo(function ManeuverLayer({ data, visible }: { data: TaperedFeatures | null; visible: boolean }) {
  const want = visible && !!data && data.features.length > 0;
  // Eltűnés közben még a régi szakasz látszik, amíg el nem halványul
  const [shown, setShown] = useState<TaperedFeatures | null>(want ? data : null);
  const [opacity, setOpacity] = useState(want ? 1 : 0);
  const current = useRef(opacity);
  current.current = opacity;
  useEffect(() => {
    if (want) setShown(data);
    const from = current.current;
    const to = want ? 1 : 0;
    if (from === to) return;
    const t0 = Date.now();
    const id = setInterval(() => {
      const f = Math.min((Date.now() - t0) / MANEUVER_FADE_MS, 1);
      setOpacity(from + (to - from) * f);
      if (f >= 1) {
        clearInterval(id);
        if (!want) setShown(null);
      }
    }, MARKER_TICK_MS);
    return () => clearInterval(id);
  }, [want, data]);
  const paint = useMemo<LineLayerSpecification['paint']>(
    () => ({ ...MANEUVER_PAINT, 'line-opacity': opacity }),
    [opacity],
  );
  return (
    <GeoJSONSource id="route-maneuvers" data={shown ?? EMPTY}>
      <Layer type="line" id="route-maneuvers" source="route-maneuvers" layout={ROUTE_LAYOUT} paint={paint} />
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
// A nyíl képe 48 pt-os; a jelölő ARROW_SIZE méretű (nagyobb: jobban látszik, és a megtett rész végének apró
// ingadozását is eltakarja)
const ARROW_IMAGE_PT = 48;
const ARROW_SIZE = 68;
const ARROW_LAYOUT: SymbolLayerSpecification['layout'] = {
  'icon-image': 'heading-arrow',
  'icon-size': ARROW_SIZE / ARROW_IMAGE_PT,
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

// Kb. a MapLibre perspektívája (≈37°-os függőleges látószög) a képernyő magasságához mérten
const PERSPECTIVE_PER_HEIGHT = 1.5;

/** A saját pozíció a képernyő közepén (követő navigáció); forgatás a rövidebb úton, natív animációval. */
function CenterArrow({ rotation, durationMs }: { rotation: number; durationMs: number }) {
  const { height } = useWindowDimensions();
  const angle = useRef(new Animated.Value(rotation)).current;
  const last = useRef(rotation);
  useEffect(() => {
    const diff = ((rotation - last.current + 540) % 360) - 180;
    last.current += diff;
    Animated.timing(angle, { toValue: last.current, duration: durationMs, easing: Easing.linear, useNativeDriver: true }).start();
  }, [rotation, angle, durationMs]);
  const rotate = angle.interpolate({ inputRange: [-360, 360], outputRange: ['-360deg', '360deg'], extrapolate: 'extend' });
  return (
    <View style={styles.center} pointerEvents="none">
      <Animated.Image
        source={ARROW_IMAGES['heading-arrow']}
        style={[
          styles.arrow,
          { transform: [{ perspective: PERSPECTIVE_PER_HEIGHT * height }, { rotateX: `${NAV_PITCH_DEG}deg` }, { rotate }] },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  arrow: { width: ARROW_SIZE, height: ARROW_SIZE },
});

// A stílus meglévő 'roads-path' rétegét módosítja (azonos id → a MapLibre a meglévő réteget frissíti)
const PathStyle = memo(function PathStyle({ mode }: { mode: Mode }) {
  const paint = useMemo(() => ({ 'line-opacity': pathOpacity(mode) }), [mode]);
  return <Layer type="line" id={PATH_LAYER_ID} paint={paint} />;
});

const PointLayer = memo(function PointLayer({ id, coord, paint, beforeId }: { id: string; coord: LngLat | null; paint: object; beforeId?: string }) {
  const data = useMemo(() => (coord ? pointFeature(coord) : EMPTY), [coord]);
  return (
    <GeoJSONSource id={id} data={data}>
      <Layer type="circle" id={id} source={id} beforeId={beforeId} paint={paint as never} />
    </GeoJSONSource>
  );
});

export function MinimapView({ mapRef, masks, route, doneRoute, doneToM, alt, onSelectAlt, maneuvers, pos, heading, dest, camera, onLongPress, onUserPan, onViewChange, northNonce, recenterNonce, mode, centerArrow, northUp, maneuversVisible, followRoute, followToM }: MinimapViewProps) {
  const cameraRef = useRef<CameraRef>(null);
  const cameraKey = camera ? JSON.stringify(camera) : null;
  const latestCamera = useRef(camera);
  latestCamera.current = camera;
  const following = !!followRoute;
  useEffect(() => {
    // Útvonalkövetés közben a kamerát a követés vezeti; utána a stop azonnal újra érvényes
    if (camera && cameraRef.current && !following) applyCameraStop(cameraRef.current, camera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraKey, recenterNonce, following]);

  // Útvonalkövetés: új célpontnál a mostani (csúszó) helyzettől indul tovább, rövid lépésekben az útvonal mentén
  const glide = useRef<AlongGlide | null>(null);
  const [followBearing, setFollowBearing] = useState(0);
  useEffect(() => {
    if (!followRoute) {
      glide.current = null;
      return;
    }
    const now = Date.now();
    const prev = glide.current;
    const fromM = prev && prev.route === followRoute ? alongAt(prev, now) : followToM;
    glide.current = {
      route: followRoute,
      fromM: Math.abs(followToM - fromM) > MARKER_MAX_GLIDE_M ? followToM : fromM,
      toM: followToM,
      t0: now,
    };
    // true, ha a csúszás végére ért
    const step = () => {
      const g = glide.current;
      if (!g || !cameraRef.current) return true;
      const t = Date.now() + FOLLOW_EASE_MS;
      const { stop, bearing } = routeFollowStep(g.route, alongAt(g, t), northUp);
      applyCameraStop(cameraRef.current, stop);
      if (northUp) setFollowBearing(bearing);
      return t - g.t0 >= NAV_CAMERA_MS;
    };
    if (step()) return;
    const id = setInterval(() => {
      if (step()) clearInterval(id);
    }, FOLLOW_TICK_MS);
    return () => clearInterval(id);
  }, [followRoute, followToM, northUp]);
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
    <>
      <Map
        ref={mapRef}
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
        <DoneLayers route={doneRoute} toM={doneToM} />
        <ManeuverLayer data={maneuvers} visible={maneuversVisible} />
        {masks.map((m, i) => (
          <MaskLayer key={`mask-${i}`} index={i} data={m} />
        ))}
        {/* A maszkok UTÁN kerül fel (beforeId=route): a maszkok fölött, a kiválasztott útvonal alatt – nem takarja semmi */}
        <AltLayer coords={alt} onPress={onSelectAlt} />
        <PointLayer id="dest" coord={dest} paint={DEST_PAINT} />
        <MeLayer coord={centerArrow ? null : pos} heading={heading} />
      </Map>
      {/* A dőlés miatt a nyíl ugyanúgy „fekszik” a térképen, mint a térképi jelölő */}
      {centerArrow && (
        <CenterArrow
          rotation={northUp ? (following ? followBearing : (heading ?? 0)) : 0}
          durationMs={following ? FOLLOW_EASE_MS : NAV_CAMERA_MS}
        />
      )}
    </>
  );
}
