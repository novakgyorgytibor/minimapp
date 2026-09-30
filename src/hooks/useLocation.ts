import * as Location from 'expo-location';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { LngLat } from '../types';

type Status = 'pending' | 'granted' | 'denied';

export function useLocation() {
  const [status, setStatus] = useState<Status>('pending');
  const [pos, setPos] = useState<LngLat | null>(null);
  const [heading, setHeading] = useState(0);
  const sub = useRef<Location.LocationSubscription | null>(null);

  const start = useCallback(async () => {
    sub.current?.remove();
    sub.current = await Location.watchPositionAsync(
      { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
      (loc) => {
        setPos([loc.coords.longitude, loc.coords.latitude]);
        const h = loc.coords.heading;
        // A menetirány csak mozgás közben megbízható
        if (h !== null && h >= 0 && (loc.coords.speed ?? 0) >= 1) setHeading(h);
      },
    );
  }, []);

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
    return () => sub.current?.remove();
  }, [start]);

  return { status, pos, heading, request };
}
