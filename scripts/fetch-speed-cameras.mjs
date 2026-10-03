#!/usr/bin/env node
// Magyarországi fix traffipaxok az OpenStreetMapből (highway=speed_camera) → tömör JSON.
// A weboldalra (website/, az app innen frissít) és az appba (src/data/, első indításhoz / net nélkül) is kiírja.
// Futtatás: node scripts/fetch-speed-cameras.mjs   (a GitHub Action hetente futtatja)
// Adat: © OpenStreetMap contributors, ODbL.
import { writeFileSync } from 'node:fs';

const OVERPASS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const ROUNDS = 3;
const QUERY = `[out:json][timeout:120];
area["ISO3166-1"="HU"][admin_level=2]->.hu;
node["highway"="speed_camera"](area.hu);
out body;`;
const OUT = ['website/speed-cameras-hu.json', 'src/data/speedCameras.json'];
const UA = 'minimap/0.1 (personal open-source navigation app; weekly speed camera export)';

const CARDINAL = {
  N: 0,
  NNE: 22.5,
  NE: 45,
  ENE: 67.5,
  E: 90,
  ESE: 112.5,
  SE: 135,
  SSE: 157.5,
  S: 180,
  SSW: 202.5,
  SW: 225,
  WSW: 247.5,
  W: 270,
  WNW: 292.5,
  NW: 315,
  NNW: 337.5,
};

/** A mért forgalom iránya fokban; ha nincs, vagy több irány / értelmezhetetlen → null (minden irányban figyelmeztet). */
function direction(tag) {
  if (!tag) return null;
  const t = tag.trim().toUpperCase();
  if (t in CARDINAL) return CARDINAL[t];
  const n = Number(t);
  return Number.isFinite(n) ? ((n % 360) + 360) % 360 : null;
}

function maxspeed(tag) {
  const n = parseInt(tag ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// A nyilvános Overpass-szerverek gyakran túlterheltek → több szerver, több kör, várakozással
async function query() {
  let lastError;
  for (let round = 0; round < ROUNDS; round++) {
    if (round > 0) await new Promise((r) => setTimeout(r, 30_000 * round));
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: 'data=' + encodeURIComponent(QUERY),
        });
        if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
        return await res.json();
      } catch (e) {
        lastError = e;
        console.error(`${url}: ${e.message}`);
      }
    }
  }
  throw lastError;
}

const data = await query();
const cameras = data.elements
  .filter((e) => e.type === 'node')
  .map((e) => [
    Number(e.lon.toFixed(6)),
    Number(e.lat.toFixed(6)),
    maxspeed(e.tags?.maxspeed),
    direction(e.tags?.direction),
  ])
  .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
// Biztonsági fék: egy hibás / üres válasz ne írja felül a jó adatot
if (cameras.length < 100) throw new Error(`Too few cameras (${cameras.length}), not writing`);
const json = JSON.stringify({
  attribution: '© OpenStreetMap contributors, ODbL',
  updated: new Date().toISOString().slice(0, 10),
  // [lng, lat, maxspeed km/h | null, mért irány fokban | null]
  cameras,
});
for (const f of OUT) writeFileSync(f, json + '\n');
console.log(`${cameras.length} cameras → ${OUT.join(', ')}`);
