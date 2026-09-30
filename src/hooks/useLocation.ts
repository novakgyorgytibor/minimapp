import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import { angleDiff, pickHeading } from '../nav/heading';
import type { LngLat } from '../types';

type Status = 'pending' | 'granted' | 'denied';

export function useLocation() {
  const [status, setStatus] = useState<Status>('pending');
  const [pos, setPos] = useState<LngLat | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const sub = useRef<Location.LocationSubscription | null>(null);
  const headingSub = useRef<Location.LocationSubscription | null>(null);
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

  const start = useCallback(async () => {
    sub.current?.remove();
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
      (loc) => {
        setPos([loc.coords.longitude, loc.coords.latitude]);
        course.current = { deg: loc.coords.heading, speed: loc.coords.speed ?? 0 };
        updateHeading();
      },
    );
    headingSub.current?.remove();
    headingSub.current = await Location.watchHeadingAsync((h) => {
      const deg = h.trueHeading >= 0 ? h.trueHeading : h.magHeading;
      compass.current = deg >= 0 ? deg : null;
      updateHeading();
    }).catch(() => null); // nincs iránytű (pl. szimulátor): marad a menetirány
  }, [updateHeading]);

  const request = useCallback(async () => {
    const { status: s } = await Location.requestForegroundPermissionsAsync();
    if (s === 'granted') {
      setStatus('granted');
      await start();
    } else {
      setStatus('denied');
    }
  }, [start]);

  useEffect(() => {
    Location.getForegroundPermissionsAsync().then(({ status: s }) => {
      if (s === 'granted') {
        setStatus('granted');
        start();
      } else {
        setStatus('denied');
      }
    });
    return () => {
      sub.current?.remove();
      headingSub.current?.remove();
    };
  }, [start]);

  return { status, pos, heading, request };
}
