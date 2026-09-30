import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { config } from './src/config';
import { useLocation } from './src/hooks/useLocation';
import { cameraFor, maskMode } from './src/map/camera';
import { MinimapView } from './src/map/MinimapView';
import { nextView, radiiFor, screenWidthM, viewBbox, zoomBucket, type View as MapViewState } from './src/map/viewport';
import { buildMasks, fullMasks } from './src/nav/corridor';
import { nextAnchor } from './src/nav/anchor';
import { nextManeuverSegment } from './src/nav/maneuverSegments';
import { angleDiff } from './src/nav/heading';
import { initialNavState, navReducer } from './src/nav/navMachine';
import { isAbortError } from './src/services/http';
import { getRoute, RouteError } from './src/services/route';
import { theme } from './src/theme';
import type { LngLat } from './src/types';
import { LangProvider, useLang } from './src/i18n/LangContext';
import { Attribution } from './src/ui/Attribution';
import { LangToggle } from './src/ui/LangToggle';
import { Compass } from './src/ui/Compass';
import { ManeuverBar } from './src/ui/ManeuverBar';
import { ModeToggle } from './src/ui/ModeToggle';
import { PermissionScreen } from './src/ui/PermissionScreen';
import { SearchBar } from './src/ui/SearchBar';
import { Speed } from './src/ui/Speed';
import { StatusLine } from './src/ui/StatusLine';
import { TripFooter } from './src/ui/TripFooter';

const NO_POSITION_MASKS = fullMasks(config.maskFractions);

export default function App() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <StatusBar style="light" />
        <Main />
      </LangProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const { lang, t } = useLang();
  const [s, dispatch] = useReducer(navReducer, undefined, () => initialNavState());
  const navigatingish = s.phase === 'navigating' || s.phase === 'rerouting' || s.phase === 'arrived';
  // Akkukímélés: nagy GPS-pontosság csak navigáció közben
  const loc = useLocation(navigatingish);
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
    getRoute(from, s.dest, s.mode, ctrl.signal, undefined, lang)
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
  useEffect(() => {
    if (!navigatingish) return;
    activateKeepAwakeAsync('nav');
    return () => {
      deactivateKeepAwake('nav');
    };
  }, [navigatingish]);

  // ◎: a nyíl a képernyő közepére (előnézetben is az útvonal helyett)
  const [focusMe, setFocusMe] = useState(false);
  const recenter = () => {
    setFollow(true);
    setFocusMe(true);
  };
  // ✕ / Mégse: vissza a jelenlegi pozícióra, akkor is, ha a kamera célja nem változott
  const [recenterNonce, setRecenterNonce] = useState(0);
  const cancelTo = (type: 'CANCEL' | 'CLOSE_SEARCH') => {
    dispatch({ type });
    setFollow(true);
    setRecenterNonce((n) => n + 1);
  };

  // Fázisváltáskor a kamera újra követ
  useEffect(() => {
    setFollow(true);
    setFocusMe(false);
  }, [s.phase]);

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
  // Vastagabb kijelölés csak navigáció közben, és csak a következő manővernél (±30 m)
  const nextIdx = s.progress?.nextStepIndex ?? 1;
  const maneuvers = useMemo(
    () => (s.route && (s.phase === 'navigating' || s.phase === 'rerouting') ? nextManeuverSegment(s.route, nextIdx, 30, 30) : null),
    [s.route, s.phase, nextIdx],
  );

  // Útvonal követésekor folyosó; elhúzott térképnél (vagy útvonal nélkül) kör a képernyő közepén; nézet nélkül fekete
  const mode = maskMode({ hasRoute: !!s.route, follow, hasView: !!view });
  const masks = mode === 'route' ? routeMasks : mode === 'center' ? idleMasks : NO_POSITION_MASKS;

  // Tájoló: navigáció követése közben észak-fent / menetirány-fent váltás, egyébként egyszeri északra fordítás
  const [northUp, setNorthUp] = useState(false);
  const [northNonce, setNorthNonce] = useState(0);
  const onCompassPress = () => {
    if (navigatingish && follow) setNorthUp((v) => !v);
    else setNorthNonce((n) => n + 1);
  };

  // Akkukímélés: alapnézetben a kamera csak érdemi (>5 m) elmozdulásnál mozdul, így nem rajzol folyton újra
  const [idleCameraPos, setIdleCameraPos] = useState<LngLat | null>(null);
  useEffect(() => {
    setIdleCameraPos((prev) => nextAnchor(prev, loc.pos, config.idleCameraStepM));
  }, [loc.pos]);
  const cameraPos = navigatingish ? loc.pos : idleCameraPos;

  const camera = cameraFor({ phase: s.phase, pos: cameraPos, heading: loc.heading ?? 0, bbox: s.route?.bbox ?? null, follow, northUp, focusMe });

  if (loc.status === 'denied') return <PermissionScreen onRequest={loc.request} />;

  return (
    <View style={styles.root}>
      <MinimapView
        masks={masks}
        route={s.route?.coords ?? null}
        maneuvers={maneuvers}
        pos={loc.pos}
        heading={loc.heading}
        dest={s.dest}
        camera={camera}
        onLongPress={(coord) => dispatch({ type: 'SET_DEST', dest: coord, label: t('droppedPin') })}
        onUserPan={() => setFollow(false)}
        onViewChange={onViewChange}
        northNonce={northNonce}
        recenterNonce={recenterNonce}
      />
      <Attribution />

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Felső sáv */}
        {s.phase === 'searching' ? (
          <SearchBar
            near={loc.pos}
            onPick={(p) => dispatch({ type: 'SET_DEST', dest: p.coord, label: p.name })}
            onCancel={() => cancelTo('CLOSE_SEARCH')}
          />
        ) : (
          <View style={styles.top}>
            {s.phase === 'idle' && (
              <Pressable onPress={() => dispatch({ type: 'OPEN_SEARCH' })} style={styles.searchButton}>
                <Text style={styles.searchText}>{t('whereTo')}</Text>
                <LangToggle />
              </Pressable>
            )}
            {s.phase === 'preview' && (
              <View style={styles.topRow}>
                <Pressable style={styles.flex} onPress={() => dispatch({ type: 'OPEN_SEARCH' })}>
                  <Text style={styles.destText} numberOfLines={1}>{s.destLabel}</Text>
                </Pressable>
                <CloseButton onPress={() => cancelTo('CANCEL')} />
              </View>
            )}
            {navigatingish && s.route && (
              <View style={styles.topRow}>
                <View style={styles.flex}>
                  <ManeuverBar route={s.route} progress={s.progress} arrived={s.phase === 'arrived'} />
                </View>
                <CloseButton onPress={() => cancelTo('CANCEL')} />
              </View>
            )}
          </View>
        )}

        {/* Alsó sáv */}
        {s.phase !== 'searching' && (
          <View style={styles.bottom} pointerEvents="box-none">
            {/* Bal lent a tájoló, jobb lent a ◎ */}
            <View style={styles.controlsRow} pointerEvents="box-none">
              <View style={styles.leftControls} pointerEvents="box-none">
                <Speed mps={loc.speed} />
                <Compass bearing={mapBearing} onPress={onCompassPress} />
              </View>
              {(!follow || (s.phase === 'preview' && !focusMe)) && (
                <Pressable onPress={recenter} style={styles.recenter} hitSlop={12}>
                  <Text style={styles.recenterText}>◎</Text>
                </Pressable>
              )}
            </View>
            <StatusLine error={s.error} loading={s.loading} onRetry={() => dispatch({ type: 'RETRY' })} />
            {s.phase === 'preview' && (
              <>
                {s.route && <TripFooter remainingM={s.route.distanceM} remainingS={s.route.durationS} />}
                <ModeToggle mode={s.mode} onChange={(mode) => dispatch({ type: 'SET_MODE', mode })} />
                {s.route && !s.loading && (
                  <Pressable onPress={() => dispatch({ type: 'START' })} style={styles.start}>
                    <Text style={styles.startText}>{t('start')}</Text>
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
  searchButton: {
    marginHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: theme.fg,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  searchText: { color: theme.fg, fontSize: 22, fontWeight: '300' },
  destText: { color: theme.fg, fontSize: 20, fontWeight: '300', paddingHorizontal: 24, paddingVertical: 12 },
  close: { padding: 12 },
  closeText: { color: theme.fg, fontSize: 22 },
  bottom: { paddingBottom: 20, paddingHorizontal: 20, gap: 4 },
  leftControls: { alignItems: 'center', gap: 14 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 8, paddingBottom: 8, minHeight: 44 },
  recenter: { padding: 4 },
  recenterText: { color: theme.fg, fontSize: 28 },
  start: { alignSelf: 'center', borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 40, paddingVertical: 12, marginTop: 8 },
  startText: { color: theme.fg, fontSize: 18 },
});
