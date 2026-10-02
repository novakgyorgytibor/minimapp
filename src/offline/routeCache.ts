import { OfflineManager } from '@maplibre/maplibre-react-native';
import { config } from '../config';
import type { Route } from '../types';
import { corridorBoxes } from './corridorBoxes';

const KIND = 'route-corridor';

/**
 * Letölti az útvonal körüli csempéket (offline csomagokba), hogy menet közben net nélkül is meglegyen
 * a térkép. A régebbi útvonalak csomagjait törli (az utolsó néhány marad). Hibát nem dob: ha nincs net,
 * egyszerűen nem lesz letöltés, a térkép a szokásos gyorsítótárból megy tovább.
 */
export async function cacheRouteCorridor(route: Route): Promise<void> {
  try {
    const routeId = `${Date.now()}`;
    const boxes = corridorBoxes(route, config.offlineChunkM, config.offlinePadM);
    for (const bounds of boxes) {
      await OfflineManager.createPack(
        {
          mapStyle: config.offlineStyleUrl,
          bounds,
          minZoom: config.offlineMinZoom,
          maxZoom: config.offlineMaxZoom,
          metadata: { kind: KIND, routeId },
        },
        (p, status) => {
          if (status.state === 'complete') OfflineManager.removeListener(p.id);
        },
        (p) => OfflineManager.removeListener(p.id),
      );
    }
    await pruneOldRoutes();
  } catch (e) {
    if (__DEV__) console.warn('[offline] route corridor download failed', e);
  }
}

async function pruneOldRoutes(): Promise<void> {
  const packs = (await OfflineManager.getPacks()).filter((p) => p.metadata?.kind === KIND);
  const ids = [...new Set(packs.map((p) => String(p.metadata.routeId)))].sort((a, b) => Number(b) - Number(a));
  const keep = new Set(ids.slice(0, config.offlineKeepRoutes));
  for (const p of packs) if (!keep.has(String(p.metadata.routeId))) await OfflineManager.deletePack(p.id);
}
