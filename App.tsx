import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { config } from './src/config';
import { useLocation } from './src/hooks/useLocation';
import { cameraFor } from './src/map/camera';
import { MinimapView } from './src/map/MinimapView';
import { nextView, radiiFor, screenWidthM, viewBbox, zoomBucket, type View as MapViewState } from './src/map/viewport';
import { buildMasks, fullMasks } from './src/nav/corridor';
import { nextAnchor } from './src/nav/anchor';
import { angleDiff } from './src/nav/heading';
import { initialNavState, navReducer } from './src/nav/navMachine';
import { isAbortError } from './src/services/http';
import { getRoute, RouteError } from './src/services/route';
import { theme } from './src/theme';
import type { LngLat } from './src/types';
import { Attribution } from './src/ui/Attribution';
import { Compass } from './src/ui/Compass';
import { ManeuverBar } from './src/ui/ManeuverBar';
import { ModeToggle } from './src/ui/ModeToggle';
import { PermissionScreen } from './src/ui/PermissionScreen';
import { SearchBar } from './src/ui/SearchBar';
import { StatusLine } from './src/ui/StatusLine';
import { TripFooter } from './src/ui/TripFooter';

const NO_POSITION_MASKS = fullMasks(config.maskFractions);

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const loc = useLocation();
  const [s, dispatch] = useReducer(navReducer, undefined, () => initialNavState());
  const [follow, setFollow] = useState(true);
  const posRef = useRef<LngLat | null>(null);
  posRef.current = loc.pos;

  // GPS → állapotgép
  useEffect(() => {
    if (loc.pos) dispatch({ type: 'POSITION', pos: loc.pos, now: Date.now() });
  }, [loc.pos]);

  // Útvonalkérés: minden új requestId-ra, ha loading
  useEffect(() => {
    if (!s.loading || !s.dest) return;
    const id = s.requestId;
    const from = posRef.current;
    if (!from) {
      dispatch({ type: 'ROUTE_FAIL', error: 'no-position', requestId: id });
      return;
    }
    const ctrl = new AbortController();
    getRoute(from, s.dest, s.mode, ctrl.signal)
      .then((route) => dispatch({ type: 'ROUTE_OK', route, requestId: id }))
      .catch((e) => {
        if (isAbortError(e)) return;
        dispatch({ type: 'ROUTE_FAIL', error: e instanceof RouteError ? e.kind : 'network', requestId: id });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.requestId]);

  // Érkezés után 5 s → idle
  useEffect(() => {
    if (s.phase !== 'arrived') return;
    const t = setTimeout(() => dispatch({ type: 'CANCEL' }), config.arrivedResetMs);
    return () => clearTimeout(t);
  }, [s.phase]);

  // Képernyő ébren tartása navigáció közben
  const navigatingish = s.phase === 'navigating' || s.phase === 'rerouting' || s.phase === 'arrived';
  useEffect(() => {
    if (!navigatingish) return;
    activateKeepAwakeAsync('nav');
    return () => {
      deactivateKeepAwake('nav');
    };
  }, [navigatingish]);

  // Fázisváltáskor a kamera újra követ
  useEffect(() => setFollow(true), [s.phase]);

  // Nézet (képernyő közepe + zoom), csak érdemi változásnál frissítve (nextView).
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [view, setView] = useState<MapViewState | null>(null);
  // A térkép forgatása a tájolóhoz (csak >1° változásnál renderelünk újra)
  const [mapBearing, setMapBearing] = useState(0);
  const onViewChange = useCallback(
    (center: LngLat, zoom: number, bearing: number) => {
      setView((prev) => nextView(prev, { center, zoom }, screenW));
      setMapBearing((prev) => (angleDiff(prev, bearing) > 1 ? bearing : prev));
    },
    [screenW],
  );

  // A halványítás a képernyőhöz mérten skálázódik (bármelyik zoomon ugyanúgy néz ki).
  const zoomB = zoomBucket(view?.zoom ?? config.idleZoom);
  const lat = view?.center[1] ?? loc.pos?.[1] ?? 47.5;
  const widthM = screenWidthM(zoomB, lat, screenW);

  // Útvonalnál csak a látható rész (+ ráhagyás) körül számolunk; a kivágás közepe csak a
  // képernyőszélesség negyedénél nagyobb elmozdulásnál lép.
  const [clipCenter, setClipCenter] = useState<LngLat | null>(null);
  useEffect(() => {
    if (view) setClipCenter((prev) => nextAnchor(prev, view.center, widthM / 4));
  }, [view, widthM]);

  // Külön memo: a (drágább) útvonal-maszk ne számolódjon újra, ha csak az idle nézet mozdul
  const routeMasks = useMemo(() => {
    if (!s.route) return [];
    const radii = radiiFor(config.corridorFadeScreenFraction * widthM, config.maskFractions);
    // A képernyő átlója (forgatás, döntés miatt bőven) + a legnagyobb sugár
    const half = (Math.hypot(screenW, screenH) / screenW) * widthM + radii[radii.length - 1];
    const clip = clipCenter ? viewBbox(clipCenter, half) : undefined;
    return buildMasks({ type: 'LineString', coords: s.route.coords }, radii, { clip });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.route, zoomB, clipCenter]);
  // Útvonal nélkül: kör a képernyő közepe körül (húzáskor vele mozog)
  const idleMasks = useMemo(
    () =>
      view
        ? buildMasks({ type: 'Point', coord: view.center }, radiiFor(config.idleFadeScreenFraction * widthM, config.maskFractions))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [view],
  );
  // Nézet nélkül (induláskor) minden fekete
  const masks = s.route ? routeMasks : view ? idleMasks : NO_POSITION_MASKS;

  const camera = cameraFor({ phase: s.phase, pos: loc.pos, heading: loc.heading ?? 0, bbox: s.route?.bbox ?? null, follow });

  if (loc.status === 'denied') return <PermissionScreen onRequest={loc.request} />;

  return (
    <View style={styles.root}>
      <MinimapView
        masks={masks}
        route={s.route?.coords ?? null}
        pos={loc.pos}
        heading={loc.heading}
        dest={s.dest}
        camera={camera}
        onLongPress={(coord) => dispatch({ type: 'SET_DEST', dest: coord, label: 'Dropped pin' })}
        onUserPan={() => setFollow(false)}
        onViewChange={onViewChange}
      />
      <Attribution />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Felső sáv */}
        {s.phase === 'searching' ? (
          <SearchBar
            near={loc.pos}
            onPick={(p) => dispatch({ type: 'SET_DEST', dest: p.coord, label: p.name })}
            onCancel={() => dispatch({ type: 'CLOSE_SEARCH' })}
          />
        ) : (
          <View style={styles.top}>
            {s.phase === 'idle' && (
              <Pressable onPress={() => dispatch({ type: 'OPEN_SEARCH' })} style={styles.searchButton}>
                <Text style={styles.searchText}>Where to?</Text>
              </Pressable>
            )}
            {s.phase === 'preview' && (
              <View style={styles.topRow}>
                <Pressable style={styles.flex} onPress={() => dispatch({ type: 'OPEN_SEARCH' })}>
                  <Text style={styles.destText} numberOfLines={1}>{s.destLabel}</Text>
                </Pressable>
                <CloseButton onPress={() => dispatch({ type: 'CANCEL' })} />
              </View>
            )}
            {navigatingish && s.route && (
              <View style={styles.topRow}>
                <View style={styles.flex}>
                  <ManeuverBar route={s.route} progress={s.progress} arrived={s.phase === 'arrived'} />
                </View>
                <CloseButton onPress={() => dispatch({ type: 'CANCEL' })} />
              </View>
            )}
            <View style={styles.compassRow} pointerEvents="none">
              <Compass bearing={mapBearing} />
            </View>
          </View>
        )}

        {/* Alsó sáv */}
        {s.phase !== 'searching' && (
          <View style={styles.bottom} pointerEvents="box-none">
            {!follow && (
              <Pressable onPress={() => setFollow(true)} style={styles.recenter} hitSlop={12}>
                <Text style={styles.recenterText}>◎</Text>
              </Pressable>
            )}
            <StatusLine error={s.error} loading={s.loading} onRetry={() => dispatch({ type: 'RETRY' })} />
            {s.phase === 'preview' && (
              <>
                {s.route && <TripFooter remainingM={s.route.distanceM} remainingS={s.route.durationS} />}
                <ModeToggle mode={s.mode} onChange={(mode) => dispatch({ type: 'SET_MODE', mode })} />
                {s.route && !s.loading && (
                  <Pressable onPress={() => dispatch({ type: 'START' })} style={styles.start}>
                    <Text style={styles.startText}>Start</Text>
                  </Pressable>
                )}
              </>
            )}
            {(s.phase === 'navigating' || s.phase === 'rerouting') && s.route && (
              <TripFooter
                remainingM={s.progress?.remainingM ?? s.route.distanceM}
                remainingS={s.progress?.remainingS ?? s.route.durationS}
              />
            )}
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

function CloseButton({ onPress }: { onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={16} style={styles.close}>
      <Text style={styles.closeText}>✕</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: theme.bg },
  overlay: { ...StyleSheet.absoluteFill, justifyContent: 'space-between' },
  flex: { flex: 1 },
  top: { paddingTop: 8 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 12 },
  searchButton: { marginHorizontal: 20, borderBottomWidth: 1, borderBottomColor: theme.fg, paddingVertical: 8 },
  searchText: { color: theme.fg, fontSize: 22, fontWeight: '300' },
  destText: { color: theme.fg, fontSize: 20, fontWeight: '300', paddingHorizontal: 24, paddingVertical: 12 },
  close: { padding: 12 },
  compassRow: { alignItems: 'flex-end', paddingRight: 24, paddingTop: 16 },
  closeText: { color: theme.fg, fontSize: 22 },
  bottom: { paddingBottom: 20, paddingHorizontal: 20, gap: 4 },
  recenter: { alignSelf: 'flex-end', padding: 8 },
  recenterText: { color: theme.fg, fontSize: 28 },
  start: { alignSelf: 'center', borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 40, paddingVertical: 12, marginTop: 8 },
  startText: { color: theme.fg, fontSize: 18 },
});
