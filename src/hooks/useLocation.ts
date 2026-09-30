import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { angleDiff, pickHeading } from '../nav/heading';
import { effectiveSpeed, locationOptions, SPEED_STALE_MS } from '../nav/power';
import type { LngLat } from '../types';

type Status = 'pending' | 'granted' | 'denied';

const ACCURACY = {
  navigation: Location.Accuracy.BestForNavigation,
  balanced: Location.Accuracy.Balanced,
} as const;

/**
 * GPS + iránytű. Akkukímélés: navigáció közben nagy pontosság (1 s / 2 m), egyébként kiegyensúlyozott
 * (5 s / 10 m); háttérben (vagy kikapcsolt képernyőnél) minden figyelés leáll, visszatéréskor újraindul.
 */
export function useLocation(navigating: boolean) {
  const [status, setStatus] = useState<Status>('pending');
  const [pos, setPos] = useState<LngLat | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [rawSpeed, setRawSpeed] = useState<number | null>(null);
  const [lastFixAt, setLastFixAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const compass = useRef<number | null>(null);
  const course = useRef<{ deg: number | null; speed: number }>({ deg: null, speed: 0 });

  // Csak >3° változásnál renderelünk újra (az iránytű másodpercenként sokszor jelez)
  const updateHeading = useCallback(() => {
    setHeading((last) => {
      const next = pickHeading({ compass: compass.current, course: course.current.deg, speedMps: course.current.speed, last });
      if (next === null || last === null) return next;
      return angleDiff(last, next) > 3 ? next : last;
    });
  }, []);

  useEffect(() => {
    const s = AppState.addEventListener('change', (state) => setAppActive(state === 'active'));
    return () => s.remove();
  }, []);

  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then(({ status: s }) => setStatus(s === 'granted' ? 'granted' : 'denied'))
      .catch(() => setStatus('denied'));
  }, []);

  // Feliratkozás csak engedéllyel és előtérben; a beállítás a navigációs állapottól függ.
  useEffect(() => {
    if (status !== 'granted' || !appActive) return;
    let cancelled = false;
    const subs: Location.LocationSubscription[] = [];
    const keep = (sub: Location.LocationSubscription | null) => {
      if (!sub) return;
      if (cancelled) sub.remove();
      else subs.push(sub);
    };
    const opts = locationOptions(navigating);

    Location.watchPositionAsync(
      { accuracy: ACCURACY[opts.accuracy], timeInterval: opts.timeInterval, distanceInterval: opts.distanceInterval },
      (loc) => {
        setPos([loc.coords.longitude, loc.coords.latitude]);
        course.current = { deg: loc.coords.heading, speed: loc.coords.speed ?? 0 };
        setRawSpeed(loc.coords.speed ?? null);
        setLastFixAt(Date.now());
        setNow(Date.now());
        updateHeading();
      },
    )
      .then(keep)
      .catch(() => {}); // kikapcsolt helymeghatározás: nincs pozíció → „Nincs GPS jel”

    Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      compass.current = deg >= 0 ? deg : null;
      updateHeading();
    })
      .then(keep)
      .catch(() => {}); // nincs iránytű (pl. szimulátor): marad a menetirány

    return () => {
      cancelled = true;
      subs.forEach((sub) => sub.remove());
    };
  }, [status, appActive, navigating, updateHeading]);

  // Ha nem jön új mérés, egyszer újraértékeljük a sebességet (→ 0), amikor elavul
  useEffect(() => {
    if (!rawSpeed) return;
    const ms = (navigating ? SPEED_STALE_MS.navigating : SPEED_STALE_MS.idle) + 100;
    const t = setTimeout(() => setNow(Date.now()), ms);
    return () => clearTimeout(t);
  }, [lastFixAt, rawSpeed, navigating]);
  const speed = effectiveSpeed({ speed: rawSpeed, lastFixAt, now, navigating });

  const request = useCallback(async () => {
    const { status: s } = await Location.requestForegroundPermissionsAsync();
    setStatus(s === 'granted' ? 'granted' : 'denied');
  }, []);

  return { status, pos, heading, speed, request };
}
