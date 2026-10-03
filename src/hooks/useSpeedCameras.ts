import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { config } from '../config';
import { newerCameraData, parseCameraData, type Camera, type CameraData } from '../nav/speedCameras';
import { fetchJson } from '../services/http';

const BUNDLED: CameraData = parseCameraData(require('../data/speedCameras.json'));
const STORAGE_KEY = 'minimap.speedCameras';
const REFRESH_EVERY_MS = 7 * 24 * 3600_000;

interface Stored {
  data: unknown;
  fetchedAt: number;
}

/**
 * Fix traffipaxok (OSM). Az appba csomagolt lista azonnal megvan; a weboldalon hetente frissülő példányt
 * legfeljebb hetente egyszer töltjük le (a pozíció nem megy ki), és a telefonon tároljuk.
 */
export function useSpeedCameras(): Camera[] {
  const [data, setData] = useState<CameraData>(BUNDLED);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: Stored | null = null;
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        stored = raw ? (JSON.parse(raw) as Stored) : null;
      } catch {
        stored = null;
      }
      const cached = stored ? parseCameraData(stored.data) : null;
      if (!cancelled) setData((d) => newerCameraData(d, cached));
      if (stored && Date.now() - stored.fetchedAt < REFRESH_EVERY_MS) return;
      const fresh = await fetchJson<unknown>(`${config.websiteUrl}/speed-cameras-hu.json`, {
        headers: { 'User-Agent': config.userAgent },
      });
      const parsed = parseCameraData(fresh);
      if (parsed.cameras.length === 0) return;
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ data: fresh, fetchedAt: Date.now() } satisfies Stored));
      if (!cancelled) setData((d) => newerCameraData(d, parsed));
    })().catch(() => {}); // net nélkül: marad a csomagolt / tárolt lista

    return () => {
      cancelled = true;
    };
  }, []);

  return data.cameras;
}
