import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { Image, Linking, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { config } from './src/config';
import type { CameraStop, MapRef } from '@maplibre/maplibre-react-native';
import { useLocation } from './src/hooks/useLocation';
import { useRoadSnap } from './src/hooks/useRoadSnap';
import { useSpeedCameras } from './src/hooks/useSpeedCameras';
import { useSpeedLimit } from './src/hooks/useSpeedLimit';
import { isSpeeding, speedLimitVisible } from './src/services/speedLimit';
import { alongAt, cameraFor, maskMode, NAV_CAMERA_MS, type AlongGlide } from './src/map/camera';
import { MARKER_MAX_GLIDE_M } from './src/map/markerAnim';
import { MinimapView } from './src/map/MinimapView';
import { nextView, radiiFor, screenWidthM, viewBbox, zoomBucket, type View as MapViewState } from './src/map/viewport';
import { buildMasks, fullMasks, type MaskGeometry } from './src/nav/corridor';
import { nextAnchor } from './src/nav/anchor';
import { parseDevLink } from './src/nav/devLink';
import { nextManeuverSegment, taperedSegment } from './src/nav/maneuverSegments';
import { coastLeadS, nextAlongTarget, pointAlong, predictAlongM, predictPos } from './src/nav/predict';
import { rollingAwakeUntil } from './src/nav/power';
import { rollingPose } from './src/nav/roadSnap';
import { camerasOnRoute, nextCamera } from './src/nav/speedCameras';
import { angleDiff } from './src/nav/heading';
import { nearestOnRoute } from './src/nav/progress';
import { initialNavState, navReducer, otherPref } from './src/nav/navMachine';
import { isAbortError } from './src/services/http';
import { getRoute, needsTollFree, RouteError, sameRoute } from './src/services/route';
import { theme } from './src/theme';
import type { LngLat, RoutePref } from './src/types';
import { LangProvider, useLang } from './src/i18n/LangContext';
import { FavoritesProvider, useFavorites } from './src/favorites/FavoritesContext';
import { findFavorite } from './src/favorites/favorites';
import { cacheRouteCorridor } from './src/offline/routeCache';
import { Attribution } from './src/ui/Attribution';
import { InfoButton } from './src/ui/InfoModal';
import { LangToggle } from './src/ui/LangToggle';
import { Compass } from './src/ui/Compass';
import { ManeuverBar } from './src/ui/ManeuverBar';
import { ModeToggle } from './src/ui/ModeToggle';
import { PermissionScreen } from './src/ui/PermissionScreen';
import { SearchBar } from './src/ui/SearchBar';
import { Speed } from './src/ui/Speed';
import { SpeedLimitSign } from './src/ui/SpeedLimitSign';
import { CameraGlow } from './src/ui/CameraGlow';
import { StatusLine } from './src/ui/StatusLine';
import { TripFooter } from './src/ui/TripFooter';

const NO_POSITION_MASKS = fullMasks(config.maskFractions);
const MANEUVER_HIDE_WITHIN_M = 50;
// A vastagítás végei ennyi hosszon, ennyi lépcsőben vékonyodnak a sima útvonal vastagságáig
const MANEUVER_TAPER_M = 15;
const MANEUVER_TAPER_STEPS = 16;
// Késő GPS-mérésnél ennyi idő után lép tovább a becslés (kicsit a csúszás vége előtt), legfeljebb ennyiszer
const COAST_STEP_MS = NAV_CAMERA_MS - 100;
const MAX_COAST_STEPS = 2;
// Útvonalon a mért helyzettől való eltérés ekkora részét hozza be a kamera mérésenként (a többit a sebesség viszi)
const ALONG_GAIN = 0.5;
// ◎ / ✕ után ennyi idő alatt áll vissza a kamera a jelölőre
const RECENTER_MS = 500;

/** ◎ után a követő (középpontos) kamera gyorsan, lágyan áll vissza; az előnézet (bbox) marad a sajátjával. */
function withRecenter(stop: CameraStop | null, recentering: boolean): CameraStop | null {
  if (!stop || !recentering || !('center' in stop)) return stop;
  return { ...stop, duration: RECENTER_MS, easing: 'ease' };
}

export default function App() {
  return (
    <SafeAreaProvider>
      <LangProvider>
        <FavoritesProvider>
          <StatusBar style="light" />
          <Main />
        </FavoritesProvider>
      </LangProvider>
    </SafeAreaProvider>
  );
}

function Main() {
  const { lang, t } = useLang();
  const [s, dispatch] = useReducer(navReducer, undefined, () => initialNavState());
  const navigatingish = s.phase === 'navigating' || s.phase === 'rerouting' || s.phase === 'arrived';
  // Útvonal nélkül is „haladunk”, ha 5 km/h felett mentünk (és még utána egy ideig) – lásd lent
  const rollingUntil = useRef(0);
  const [rollingAwake, setRollingAwake] = useState(false);
  // Akkukímélés: nagy GPS-pontosság csak navigáció közben, vagy útvonal nélkül haladva (a követő kamerához)
  const loc = useLocation(navigatingish || rollingAwake);
  // Sebességkorlát-tábla és traffipax: autós módban navigáció közben, vagy 5 km/h felett útvonal nélkül is
  const roadSignsVisible = speedLimitVisible({
    mode: s.mode,
    navigating: s.phase === 'navigating' || s.phase === 'rerouting',
    speedMps: loc.speed,
  });
  const speedLimit = useSpeedLimit(loc.pos, roadSignsVisible);
  const speedCameras = useSpeedCameras();
  const [follow, setFollow] = useState(true);
  const { favorites, toggle: toggleFavorite } = useFavorites();
  // A kiválasztott hely második sora (város, utca) – kedvencnek jelöléskor ezt is elmentjük
  const [destDetail, setDestDetail] = useState('');
  const posRef = useRef<LngLat | null>(null);
  posRef.current = loc.pos;
  // Újratervezéshez a menetirány (csak haladás közben megbízható)
  const headingRef = useRef<number | null>(null);
  headingRef.current = loc.speed !== null && loc.speed > config.rerouteHeadingMinSpeedMps ? loc.heading : null;

  // GPS → állapotgép: minden mérésre (a simított pozíció nem mindig változik, a nyers igen)
  useEffect(() => {
    if (!loc.pos) return;
    const course = loc.speed !== null && loc.speed > config.offRouteHeadingMinSpeedMps ? loc.heading : null;
    dispatch({ type: 'POSITION', pos: loc.pos, raw: loc.fix?.raw, course, now: Date.now() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.fix]);

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
    const dest = s.dest;
    // Előnézetben a leggyorsabb és a legrövidebb párhuzamosan; újratervezésnél csak a választott típus
    const withAlt = s.phase === 'preview' || s.phase === 'searching';
    const heading = s.phase === 'rerouting' ? headingRef.current : null;
    const get = (pref: RoutePref) => getRoute(from, dest, s.mode, ctrl.signal, undefined, lang, pref, heading);
    const altPref = otherPref(s.pref);
    Promise.all([get(s.pref), withAlt ? get(altPref).catch(() => null) : Promise.resolve(null)])
      .then(async ([route, other]) => {
        let alt = other && !sameRoute(route, other) ? other : null;
        let pref = altPref;
        // Ha csak útdíjas találat van, alternatívának egy útdíj nélkülit kérünk (ha van ilyen)
        if (withAlt && s.mode === 'auto' && needsTollFree(route, alt)) {
          const free = await get('notoll').catch((e) => {
            if (isAbortError(e)) throw e;
            return null;
          });
          if (free && !free.hasToll) {
            alt = free;
            pref = 'notoll';
          }
        }
        dispatch({ type: 'ROUTE_OK', route, alt, altPref: pref, requestId: id });
      })
      .catch((e) => {
        if (isAbortError(e)) return;
        dispatch({ type: 'ROUTE_FAIL', error: e instanceof RouteError ? e.kind : 'network', requestId: id });
      });
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.requestId]);

  // Fejlesztői mélylink (csak dev buildben): cél beállítása, és kérésre automatikus indulás
  const pendingStart = useRef(false);
  useEffect(() => {
    if (!__DEV__) return;
    const handle = (url: string | null) => {
      const link = parseDevLink(url);
      if (!link) return;
      pendingStart.current = link.start;
      dispatch({ type: 'CANCEL' });
      setDestDetail('');
      dispatch({ type: 'SET_DEST', dest: link.dest, label: link.label });
    };
    Linking.getInitialURL().then(handle).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (pendingStart.current && s.phase === 'preview' && s.route && !s.loading) {
      pendingStart.current = false;
      dispatch({ type: 'START' });
    }
  }, [s.phase, s.route, s.loading]);

  // Érkezés után 5 s → idle
  useEffect(() => {
    if (s.phase !== 'arrived') return;
    const t = setTimeout(() => dispatch({ type: 'CANCEL' }), config.arrivedResetMs);
    return () => clearTimeout(t);
  }, [s.phase]);

  // Útvonal nélkül is ébren marad a képernyő, ha 5 km/h felett haladunk (a telefon ki van rakva az autóban);
  // megállás után még ROLLING_KEEP_AWAKE_MS-ig (piros lámpa, dugó), utána a rendszer elsötétítheti.
  useEffect(() => {
    const now = Date.now();
    rollingUntil.current = rollingAwakeUntil(rollingUntil.current, loc.speed, now);
    const left = rollingUntil.current - now;
    setRollingAwake(left > 0);
    if (left <= 0) return;
    const t = setTimeout(() => setRollingAwake(false), left);
    return () => clearTimeout(t);
  }, [loc.speed, loc.fix]);

  // Képernyő ébren tartása navigáció közben, vagy útvonal nélkül haladás közben
  const keepAwake = navigatingish || rollingAwake;
  useEffect(() => {
    if (!keepAwake) return;
    activateKeepAwakeAsync('nav');
    return () => {
      deactivateKeepAwake('nav');
    };
  }, [keepAwake]);

  const onSelectAlt = useCallback(() => dispatch({ type: 'SELECT_ALT' }), []);

  // ◎: vissza a követésre – előnézetben az útvonalválasztós nézetre, egyébként a nyílra középre.
  // A nonce miatt akkor is újra beáll, ha a kamera célja közben nem változott.
  const recenter = () => {
    setFollow(true);
    setRecenterNonce((n) => n + 1);
    startRecentering();
  };
  // ◎ után a kamera gyorsan (RECENTER_MS alatt) áll vissza, és a középső nyíl is ennyi után jelenik meg – különben
  // a lassú, egyenletes visszacsúszás alatt a jelölő a képernyőn kívül lenne, és a nyíl másodpercekre eltűnne
  const [recentering, setRecentering] = useState(false);
  const recenterTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startRecentering = () => {
    setRecentering(true);
    if (recenterTimer.current) clearTimeout(recenterTimer.current);
    recenterTimer.current = setTimeout(() => setRecentering(false), RECENTER_MS);
  };
  useEffect(() => () => {
    if (recenterTimer.current) clearTimeout(recenterTimer.current);
  }, []);
  // ✕ / Mégse: vissza a jelenlegi pozícióra, akkor is, ha a kamera célja nem változott
  const [recenterNonce, setRecenterNonce] = useState(0);
  const cancelTo = (type: 'CANCEL' | 'CLOSE_SEARCH') => {
    dispatch({ type });
    setFollow(true);
    setRecenterNonce((n) => n + 1);
    startRecentering();
  };

  // Fázisváltáskor a kamera újra követ
  useEffect(() => setFollow(true), [s.phase]);

  // Navigáció indulásakor (és újratervezés után) letöltjük az útvonal körüli térképet → net nélkül is megvan
  const navRoute = s.phase === 'navigating' ? s.route : null;
  useEffect(() => {
    if (navRoute) void cacheRouteCorridor(navRoute);
  }, [navRoute]);
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
    const radii = radiiFor(config.corridorFadeScreenFraction[s.mode] * widthM, config.maskFractions);
    // A képernyő átlója (forgatás, döntés miatt bőven) + a legnagyobb sugár
    const half = (Math.hypot(screenW, screenH) / screenW) * widthM + radii[radii.length - 1];
    const clip = clipCenter ? viewBbox(clipCenter, half) : undefined;
    // Előnézetben a másik útvonal körül is nyitott a folyosó
    const altCoords = s.phase === 'preview' ? s.alt?.coords : undefined;
    const geom: MaskGeometry = altCoords
      ? { type: 'MultiLineString', lines: [s.route.coords, altCoords] }
      : { type: 'LineString', coords: s.route.coords };
    return buildMasks(geom, radii, { clip });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.route, s.alt, s.phase, s.mode, zoomB, clipCenter]);
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
  // 50 m-rel a manőver előtt lágyan eltűnik (odaérve már ne takarja a kanyart)
  const nearManeuver = (s.progress?.distToManeuverM ?? Infinity) < MANEUVER_HIDE_WITHIN_M;
  const maneuvers = useMemo(
    () =>
      s.route && (s.phase === 'navigating' || s.phase === 'rerouting')
        ? taperedSegment(nextManeuverSegment(s.route, nextIdx, 30, 30), MANEUVER_TAPER_M, MANEUVER_TAPER_STEPS)
        : null,
    [s.route, s.phase, nextIdx],
  );

  // Útvonal követésekor folyosó; elhúzott térképnél (vagy útvonal nélkül) kör a képernyő közepén; nézet nélkül fekete
  const mode = maskMode({ hasRoute: !!s.route, follow, hasView: !!view });
  const masks = mode === 'route' ? routeMasks : mode === 'center' ? idleMasks : NO_POSITION_MASKS;

  // Tájoló: navigáció követése közben észak-fent / menetirány-fent váltás, egyébként egyszeri északra fordítás
  const [northUp, setNorthUp] = useState(false);
  const [northNonce, setNorthNonce] = useState(0);
  const onCompassPress = () => {
    if ((navigatingish || rolling) && follow) setNorthUp((v) => !v);
    else setNorthNonce((n) => n + 1);
  };

  // Útvonal nélkül, haladás közben a jelölő az útra illeszkedik (elhúzott térképnél is, így a ◎ után azonnal megvan a
  // célpont); követéskor a kamera is menetirányba fordulva, az útra illesztve követ
  const rolling = s.phase === 'idle' && rollingAwake;
  const mapRef = useRef<MapRef>(null);

  // Akkukímélés: alapnézetben a kamera csak érdemi (>5 m) elmozdulásnál mozdul, így nem rajzol folyton újra
  const [idleCameraPos, setIdleCameraPos] = useState<LngLat | null>(null);
  useEffect(() => {
    setIdleCameraPos((prev) => nextAnchor(prev, loc.pos, config.idleCameraStepM));
  }, [loc.pos]);
  // Navigáció közben a jelölő az útvonalra illeszkedik, amíg nem tértünk le róla (nincs oldalirányú ugrálás).
  // Az első letérésre utaló mérésnél (és újratervezés közben) már nem: különben a régi útvonalon „haladna tovább”.
  const onRoute =
    navigatingish &&
    s.phase !== 'rerouting' &&
    s.offRouteCount === 0 &&
    s.progress !== null &&
    s.progress.distFromRouteM <= config.offRouteM[s.mode];
  // Egy GPS-mérés egyszer frissítse a célpontot: útvonalon a (következő renderben érkező) új illesztéssel, különben
  // az új pozícióval. (A sebesség/irány már az előző renderben megváltozik → a régi illesztéssel újraindulna a
  // csúszás majdnem ugyanoda, és a jelölő/kamera lelassulna.)
  const poseKey = onRoute ? s.progress : loc.pos;
  // Lassan / állva nincs előrebecslés, és mérés sem jön → ott az iránytű forgassa a nyilat mérés nélkül is
  const slowHeading = (loc.speed ?? 0) < config.courseMinSpeedMps ? loc.heading : null;
  // Ha késik a következő mérés, a becslés még legfeljebb MAX_COAST_STEPS lépésig továbbmegy → a kamera nem áll meg
  const [coast, setCoast] = useState(0);
  useEffect(() => setCoast(0), [poseKey]);
  const coasting = navigatingish && s.phase !== 'arrived';
  useEffect(() => {
    if (!coasting || coast >= MAX_COAST_STEPS) return;
    const t = setTimeout(() => setCoast((c) => c + 1), COAST_STEP_MS);
    return () => clearTimeout(t);
  }, [poseKey, coast, coasting]);
  // Mikor jött a mostani mérés (útvonalon a mért helyzetet ehhez képest becsüljük előre)
  const fixAt = useRef({ key: poseKey, at: Date.now() });
  if (fixAt.current.key !== poseKey) fixAt.current = { key: poseKey, at: Date.now() };
  // Az útvonalon a jelölő/kamera csúszása (ugyanaz, amit a MinimapView is számol): innen folytatódik a következő
  const alongGlide = useRef<AlongGlide | null>(null);
  // Előrebecslés: oda csúszik a jelölő (és a kamera), ahol a csúszás végére leszünk → folyamatos mozgás.
  // A megtett útszakasz (halványszürke) ugyanoda tart → mögötte nem marad fehér sáv.
  const nav = useMemo(() => {
    const p = onRoute && s.progress ? s.progress.snappedPos : loc.pos;
    const heading = loc.heading;
    if (!navigatingish || !s.route || !s.progress || s.phase === 'arrived' || !onRoute) alongGlide.current = null;
    if (!navigatingish || !s.route || !s.progress) return { pos: p, heading, doneToM: 0 };
    if (s.phase === 'arrived') return { pos: p, heading, doneToM: s.progress.distAlongM };
    if (!onRoute) {
      const leadS = coastLeadS(coast, NAV_CAMERA_MS, COAST_STEP_MS);
      const pos = p && predictPos({ pos: p, speedMps: loc.speed, heading, onRoute: null, leadS });
      // A megtett rész a jelölő vetületéig ér (ne maradjon le a csúszásnyi előrebecsléssel → fehér sáv a nyíl mögött)
      const hint = { alongM: s.progress.distAlongM, pos: s.progress.snappedPos };
      const doneToM = pos ? Math.max(s.progress.distAlongM, nearestOnRoute(pos, s.route, hint).alongM) : s.progress.distAlongM;
      return { pos, heading, doneToM };
    }
    // Útvonalon: a mostani csúszó helyzetből a mért sebességgel tovább, a GPS-zajt csak félig követve (nem rángat)
    const now = Date.now();
    const measuredM = predictAlongM(s.route, s.progress.distAlongM, loc.speed, (now - fixAt.current.at) / 1000);
    const prev = alongGlide.current;
    const fromM = prev && prev.route === s.route ? alongAt(prev, now) : measuredM;
    const toM = nextAlongTarget({
      fromM,
      measuredM,
      speedMps: loc.speed,
      leadS: NAV_CAMERA_MS / 1000,
      gain: ALONG_GAIN,
      resetM: MARKER_MAX_GLIDE_M,
      maxM: s.route.distanceM,
    });
    alongGlide.current = { route: s.route, fromM, toM, t0: now };
    return { pos: pointAlong(s.route, toM), heading, doneToM: toM };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poseKey, slowHeading, coast, s.route, s.phase, onRoute, navigatingish]);
  // Útvonal nélkül, haladás közben: a jelölő és a kamera a legközelebbi, menetirányba eső útra illeszkedik, a térkép
  // menetirányba fordul (mint navigációban). A célpont csak az illesztés végén frissül → nem ugrál nyers és illesztett között.
  // Állva (piros lámpa) a menetirány helyett az iránytű jönne, ami a kirakott telefon tájolása → marad az utolsó irány
  const rollHeading = useRef<number | null>(null);
  const snapHeading = (loc.speed ?? 0) >= config.courseMinSpeedMps ? loc.heading : (rollHeading.current ?? loc.heading);
  const roadSnap = useRoadSnap(mapRef, loc.pos, snapHeading, rolling, s.mode);
  const roll = useMemo(
    () => (roadSnap ? rollingPose(roadSnap, loc.speed, snapHeading, NAV_CAMERA_MS / 1000) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [roadSnap],
  );
  rollHeading.current = rolling ? (roll?.heading ?? rollHeading.current) : null;
  const markerPos = navigatingish ? nav.pos : (roll?.pos ?? loc.pos);
  const markerHeading = navigatingish ? nav.heading : roll ? roll.heading : loc.heading;
  const cameraPos = navigatingish ? markerPos : roll ? roll.pos : idleCameraPos;
  const doneToM = nav.doneToM;

  // Traffipax előttünk (a tábla gyorsabban pulzál): az útvonalon az útvonal mentén, letérve a menetirányban légvonalban
  const routeCameras = useMemo(
    () => (s.route && navigatingish ? camerasOnRoute(speedCameras, s.route) : []),
    [speedCameras, s.route, navigatingish],
  );
  const cameraAhead = useMemo(
    () =>
      roadSignsVisible && loc.pos
        ? nextCamera({
            pos: loc.pos,
            heading: loc.heading,
            speedMps: loc.speed ?? 0,
            cameras: speedCameras,
            onRoute: onRoute && s.progress ? { cameras: routeCameras, distAlongM: s.progress.distAlongM } : null,
          })
        : null,
    [roadSignsVisible, loc.pos, loc.heading, loc.speed, speedCameras, routeCameras, onRoute, s.progress],
  );

  // Előnézetben mindkét útvonal férjen a képbe
  const previewBbox = useMemo(() => {
    const a = s.route?.bbox;
    const b = s.phase === 'preview' ? s.alt?.bbox : undefined;
    if (!a || !b) return a ?? null;
    return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] as [number, number, number, number];
  }, [s.route, s.alt, s.phase]);

  // Követő navigáció közben a kamera pontosan oda csúszik (natívan, simán), ahová a jelölő → a nyíl a képernyő
  // közepén áll, a térkép mozog alatta. A kamera beállása (indulás, ◎) után kapcsol át, addig a térképi jelölő látszik.
  // Útvonal nélkül, haladás közben ugyanígy: a JS-ből csúsztatott térképi jelölő a natívan mozgó kamerához képest ugrálna
  const centerWanted = (navigatingish || !!roll) && follow && !!markerPos;
  const [centerArrow, setCenterArrow] = useState(false);
  useEffect(() => {
    if (!centerWanted) {
      setCenterArrow(false);
      return;
    }
    const t = setTimeout(() => setCenterArrow(true), recentering ? RECENTER_MS : NAV_CAMERA_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [centerWanted, recenterNonce]);

  // Autóval az útvonalon a kamera (és a középen álló nyíl) az útvonal mentén, annak irányába néz – kanyarban is az
  // úton marad, nem vágja le az ívet
  const followRoute = centerArrow && onRoute && s.mode === 'auto' && s.phase !== 'arrived' ? s.route : null;

  const camera = withRecenter(
    cameraFor({ phase: s.phase, pos: cameraPos, heading: markerHeading ?? 0, bbox: previewBbox, follow, northUp, rolling: !!roll }),
    recentering,
  );

  if (loc.status === 'denied') return <PermissionScreen onRequest={loc.request} />;

  return (
    <View style={styles.root}>
      <MinimapView
        mapRef={mapRef}
        masks={masks}
        route={s.route?.coords ?? null}
        doneRoute={navigatingish ? s.route : null}
        doneToM={doneToM}
        alt={s.phase === 'preview' ? (s.alt?.coords ?? null) : null}
        onSelectAlt={onSelectAlt}
        maneuvers={maneuvers}
        maneuversVisible={!nearManeuver}
        pos={markerPos}
        heading={markerHeading}
        centerArrow={centerArrow}
        northUp={northUp}
        followRoute={followRoute}
        followToM={doneToM}
        dest={s.dest}
        camera={camera}
        onLongPress={(coord) => {
          setDestDetail('');
          dispatch({ type: 'SET_DEST', dest: coord, label: t('droppedPin') });
        }}
        onUserPan={() => setFollow(false)}
        onViewChange={onViewChange}
        northNonce={northNonce}
        recenterNonce={recenterNonce}
        mode={s.mode}
      />
      <Attribution />
      {/* Traffipax előttünk: a képernyő szélein befelé halványuló, lüktető fehér sáv */}
      {cameraAhead && <CameraGlow />}

      <SafeAreaView style={styles.overlay} pointerEvents="box-none">
        {/* Felső sáv */}
        {s.phase === 'searching' ? (
          <SearchBar
            near={loc.pos}
            onPick={(p) => {
              setDestDetail(p.detail);
              dispatch({ type: 'SET_DEST', dest: p.coord, label: p.name });
            }}
            onCancel={() => cancelTo('CLOSE_SEARCH')}
          />
        ) : (
          <View style={styles.top}>
            {s.phase === 'idle' && (
              <>
                <Pressable onPress={() => dispatch({ type: 'OPEN_SEARCH' })} style={styles.searchButton}>
                  <Text style={styles.searchText}>{t('whereTo')}</Text>
                  <LangToggle />
                </Pressable>
                <InfoButton />
              </>
            )}
            {s.phase === 'preview' && (
              <View style={styles.topRow}>
                <Pressable style={styles.flex} onPress={() => dispatch({ type: 'OPEN_SEARCH' })}>
                  <Text style={styles.destText} numberOfLines={1}>{s.destLabel}</Text>
                </Pressable>
                <View style={styles.sideButtons}>
                  <CloseButton onPress={() => cancelTo('CANCEL')} />
                  {s.dest && (
                    <FavoriteButton
                      on={!!findFavorite(favorites, s.dest)}
                      onPress={() => s.dest && toggleFavorite({ name: s.destLabel ?? t('droppedPin'), detail: destDetail, coord: s.dest })}
                    />
                  )}
                </View>
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
                <SpeedLimitSign kmh={speedLimit} speeding={isSpeeding(loc.speed, speedLimit)} />
                <Speed mps={loc.speed} />
                <Compass bearing={mapBearing} onPress={onCompassPress} />
              </View>
              {!follow && (
                <Pressable onPress={recenter} style={styles.recenter} hitSlop={12}>
                  <Text style={styles.recenterText}>◎</Text>
                </Pressable>
              )}
            </View>
            <StatusLine
              cameraAhead={!!cameraAhead}
              error={s.error}
              loading={s.loading}
              rerouting={s.phase === 'rerouting'}
              onRetry={() => dispatch({ type: 'RETRY' })}
            />
            {s.phase === 'preview' && (
              <>
                {s.route && (
                  <TripFooter
                    remainingM={s.route.distanceM}
                    remainingS={s.route.durationS}
                    label={s.route.hasToll ? t('toll') : undefined}
                  />
                )}
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

const HEART = require('./assets/heart.png');
const HEART_OUTLINE = require('./assets/heart-outline.png');

/** Teli szív = kedvenc, körvonalas = nem; koppintásra a telefonon tárolt kedvencek közé kerül / kikerül. */
function FavoriteButton({ on, onPress }: { on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={16} style={styles.close}>
      <Image source={on ? HEART : HEART_OUTLINE} style={styles.heart} />
    </Pressable>
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
  sideButtons: { alignItems: 'center' },
  close: { padding: 12 },
  closeText: { color: theme.fg, fontSize: 22 },
  heart: { width: 24, height: 24, tintColor: theme.fg },
  bottom: { paddingBottom: 20, paddingHorizontal: 20, gap: 4 },
  leftControls: { alignItems: 'center', gap: 14 },
  controlsRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingHorizontal: 8, paddingBottom: 8, minHeight: 44 },
  recenter: { padding: 4 },
  recenterText: { color: theme.fg, fontSize: 28 },
  start: { alignSelf: 'center', borderWidth: 1, borderColor: theme.fg, paddingHorizontal: 40, paddingVertical: 12, marginTop: 8 },
  startText: { color: theme.fg, fontSize: 18 },
});
