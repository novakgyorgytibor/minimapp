import { config } from '../config';
import { pointAlong } from '../nav/predict';
import type { LngLat, Route } from '../types';
import { fetchJson, type FetchDeps } from './http';

/**
 * Forgalmi menetidő a TomTomtól: a (Valhalla) útvonalat a TomTom a megadott pontok mentén újraszámolja
 * (reconstructionMode=track), az élő és a napszak szerinti forgalommal. Az útvonal és a manőverek maradnak
 * a Valhalláé, csak az időt vesszük át (arányként, lásd trafficFactor).
 */

export function trafficEnabled(): boolean {
  return config.tomtomKey.length > 0;
}

/**
 * Az útvonal pontjai alongM-től a végéig, ritkítva: legalább spacingM-enként egy pont (a TomTom ezek mentén
 * rakja össze az utat; túl ritkán egy-egy kereszteződésnél más utat választhatna), legfeljebb ~maxPoints pont.
 */
export function supportingPoints(route: Route, alongM: number, maxPoints: number = config.trafficMaxPoints): LngLat[] {
  const { coords, cumDistM, distanceM } = route;
  const from = Math.min(Math.max(alongM, 0), distanceM);
  const spacingM = Math.max(config.trafficSpacingM, (distanceM - from) / maxPoints);
  const out: LngLat[] = [pointAlong(route, from)];
  let next = from + spacingM;
  for (let i = 0; i < coords.length - 1; i++) {
    if (cumDistM[i] <= from) continue;
    if (cumDistM[i] >= next) {
      out.push(coords[i]);
      next = cumDistM[i] + spacingM;
    }
  }
  out.push(coords[coords.length - 1]);
  return out;
}

interface TomTomResponse {
  routes?: { summary?: { travelTimeInSeconds?: number; lengthInMeters?: number } }[];
}

/**
 * A pontok mentén autóval, forgalommal számolt menetidő (s). expectedM: a szakasz hossza nálunk. Ha a TomTom
 * útja ennél érdemben hosszabb/rövidebb, máshol ment (pl. a kezdőpontot nem tudta útra illeszteni, és kerülőt
 * tett) → az ideje sem erre az útra szól, elutasítjuk.
 */
export async function getTrafficTimeS(
  points: LngLat[],
  expectedM: number,
  signal?: AbortSignal,
  deps: FetchDeps = {},
): Promise<number> {
  const a = points[0];
  const b = points[points.length - 1];
  const params = new URLSearchParams({
    key: config.tomtomKey,
    traffic: 'true',
    travelMode: 'car',
    routeType: 'fastest',
    reconstructionMode: 'track',
  });
  const url = `${config.tomtomRoutingUrl}/${a[1]},${a[0]}:${b[1]},${b[0]}/json?${params}`;
  const body = JSON.stringify({ supportingPoints: points.map(([lon, lat]) => ({ latitude: lat, longitude: lon })) });
  // 429-nél nem próbálkozunk újra: az ingyenes keret elfogyott, ilyenkor a Valhalla ideje marad
  const json = await fetchJson<TomTomResponse>(
    url,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, signal },
    { retries: 0, ...deps },
  );
  const summary = json.routes?.[0]?.summary;
  const s = summary?.travelTimeInSeconds;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0) throw new Error('traffic: no travel time');
  const len = summary?.lengthInMeters;
  if (typeof len === 'number' && Math.abs(len - expectedM) > Math.max(config.trafficLengthTolM, expectedM * config.trafficLengthTolFraction)) {
    throw new Error('traffic: reconstructed route differs');
  }
  return s;
}

/**
 * A Valhalla-idő szorzója (TomTom-idő / Valhalla-idő ugyanarra a szakaszra). Így a hátralévő idő a menet közben
 * is folyamatosan csökken (a Valhalla lépésidőiből), csak a forgalomhoz igazítva. Szélsőséges eltérésnél
 * (hibás illesztés) korlátozva.
 */
export function trafficFactor(trafficS: number, valhallaS: number): number | null {
  if (!(valhallaS > 0) || !(trafficS > 0)) return null;
  return Math.min(Math.max(trafficS / valhallaS, config.trafficFactorMin), config.trafficFactorMax);
}

/** Forgalommal az alternatíva érdemben gyorsabb-e (a különbség legalább perc nagyságrendű és pár százalék). */
export function altIsFaster(mainS: number, altS: number): boolean {
  return mainS - altS >= Math.max(config.trafficFasterMinS, mainS * config.trafficFasterFraction);
}
