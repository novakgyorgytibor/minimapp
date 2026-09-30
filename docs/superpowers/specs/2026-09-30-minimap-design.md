# minimap – minimalista GPS navigáció (design)

Dátum: 2026-09-30

## Cél

Minimalista, React Native alapú navigációs app. A kijelző a lehető legfeketébb (#000), minden
más elem fehér. A kijelölt útvonal tisztán fehér; a környező utak csak az útvonal körüli
folyosóban látszanak, az útvonaltól távolodva elhalványulva, a képernyő többi része fekete.
Kizárólag ingyenes, nyílt forrású térkép-, útvonaltervező és keresőszolgáltatást használ.

## Követelmények

- Platform: React Native (Expo, dev build, TypeScript).
- Közlekedési módok: autó, bicikli, gyalog – választható.
- Navigáció: szöveges turn-by-turn (következő manőver + távolság), hátralévő idő/táv/érkezés,
  automatikus újratervezés letéréskor. Hang nincs.
- Cél megadása: szöveges keresés vagy hosszú nyomás a térképen. Kiindulópont mindig az aktuális GPS pozíció.
  Nincs köztes megálló, nincsenek mentett helyek.
- Vizuális: az utak csak az útvonal ~300 m-es folyosójában látszanak, fokozatosan elhalványulva.
  Útvonal nélkül (idle) a saját pozíció körüli ~300 m-es körben.

## Technológia

- `@maplibre/maplibre-react-native` – térkép.
- `expo-location` – pozíció, irány.
- `@turf/turf` (vagy moduláris `@turf/*`) – buffer, legközelebbi pont, távolság.
- Jest – egységtesztek.

## Külső szolgáltatások

| Szerep | Szolgáltatás | Megjegyzés |
|---|---|---|
| Vektorcsempék | OpenFreeMap (`https://tiles.openfreemap.org/planet`, OpenMapTiles séma) | kulcs nélkül |
| Útvonal | Valhalla, FOSSGIS (`https://valhalla1.openstreetmap.de/route`) | `auto` / `bicycle` / `pedestrian`, `language: hu-HU` |
| Keresés | Nominatim (`https://nominatim.openstreetmap.org/search`) | max 1 kérés/s, egyedi User-Agent |

Minden végpont a `src/config.ts`-ben, így később saját szerverre állítható.
A „© OpenStreetMap” attribúció kötelezően megjelenik (apró, szürke).

## Térképstílus

Saját, minimális MapLibre style JSON (`src/map/style.ts`):
- `background`: `#000000`.
- Egyetlen tartalmi forrás: OpenFreeMap vektorcsempék, csak a `transportation` réteg vonalai,
  szín ~`#555555`, vastagság úttípus (`class`) és zoom szerint.
- Nincs épület, víz, landuse, POI, felirat.

## Folyosós elhalványítás (A megközelítés: rétegzett fekete maszkok)

- A halvány utak mindenhol kirajzolódnak.
- Fölöttük N (alapértelmezés 6) fekete `fill` réteg. Mindegyik egy „világ” sokszög, lyukkal:
  a lyuk az útvonal `turf.buffer`-e r_i sugárral (pl. 50, 100, 150, 200, 250, 300 m).
- Minden maszk átlátszatlansága úgy van megválasztva, hogy a legkülső (300 m-en kívüli)
  terület összesítve teljesen fekete legyen: a legkülső maszk opacity 1, a belsők együtt
  lépcsőzetes sötétedést adnak (pl. 0.2 rétegenként).
- A maszkok útvonalanként egyszer számolódnak (`nav/corridor.ts`).
- Idle állapotban ugyanez a pozíció pontja körül (kör-buffer), pozícióváltozáskor
  (>30 m elmozdulás) újraszámolva.

Rétegsorrend (alulról): halvány utak → maszkok → fehér útvonal (~6 px, `#FFFFFF`) → pozíció jelölő (fehér pont/nyíl).

## Fájlszerkezet

```
src/
  config.ts              – végpontok, User-Agent, buffer-sugarak, küszöbök
  services/
    geocode.ts           – search(q, near) → Place[]            (Nominatim)
    route.ts             – getRoute(from, to, mode) → Route     (Valhalla, polyline6 dekódolás)
  nav/
    corridor.ts          – buildMasks(geometry, radii) → FeatureCollection[]
    progress.ts          – snap(pos, route) → { distAlong, distFromRoute, stepIndex, distToNextManeuver, remaining }
    navMachine.ts        – állapotgép: idle → searching → preview → navigating → rerouting → arrived
  map/
    style.ts             – fekete minimál stílus
    MapView.tsx          – térkép + rétegek
  ui/
    SearchBar.tsx        – fehér szövegmező + találatlista
    ModeToggle.tsx       – autó / bicikli / gyalog
    ManeuverBar.tsx      – felső sor: „300 m · Jobbra: Andrássy út”
    TripFooter.tsx       – alsó sor: hátralévő idő · km · érkezés
App.tsx                  – állapotgép + UI összekötése
```

`Route` típus: `{ geometry: LineString, distanceM, durationS, steps: Step[] }`,
`Step`: `{ instruction, streetName?, distanceM, beginIndex }` (Valhalla maneuver `begin_shape_index`).

## Állapotok és adatfolyam

1. **idle** – kamera követi a pozíciót, északra tájolva; kör-maszk a pozíció körül.
2. **searching** – 400 ms debounce, max 1 kérés/s a Nominatim felé, `viewbox` a pozíció körül előnyben.
   Cél: találat kiválasztása vagy hosszú nyomás a térképen.
3. **preview** – Valhalla útvonal; fehér útvonal + folyosó-maszkok; kamera az útvonal befoglalójára;
   alul idő/táv, módváltó, „Indulás”. Módváltáskor újratervezés.
4. **navigating** – kamera követ, menetirány szerint forgat, pitch ~45°. Minden GPS-frissítésnél
   `progress.snap` → felső sor a következő manőver, alsó sor a hátralévő adatok.
5. **rerouting** – ha 3 egymást követő mérésnél a távolság az útvonaltól > 40 m (gyalog: 25 m),
   új útvonal az aktuális pozícióból; két újratervezés között min. 10 s.
6. **arrived** – célhoz 20 m-en belül „Megérkeztél”, majd 5 s után idle.
   Bármely állapotból „✕” (fehér szöveg) visszavisz idle-be.

## Hibakezelés

Fehér, egysoros státuszüzenet, modal nélkül:
- hálózati hiba / timeout (10 s): „Nincs kapcsolat · újra” (koppintásra újrapróbál);
- nincs útvonal (Valhalla 400, „No path”): „Nem található útvonal”;
- nincs keresési találat: „Nincs találat”;
- GPS engedély hiányzik: egyképernyős magyarázat + engedélykérő gomb;
- HTTP 429: exponenciális backoff (1 s, 2 s, 4 s, max 3 próba).

## Tesztelés

- Jest egységtesztek: `corridor` (maszkok száma, lyuk tartalmazza az útvonalat),
  `progress` (snap, távolság útvonaltól, lépésindex), `navMachine` (átmenetek, reroute küszöb/throttle),
  `route` (polyline6 dekódolás, válasz leképezés valós Valhalla válaszmintából),
  `geocode` (válasz leképezés, rate limit).
- Kézi teszt dev buildben: szimulált GPS útvonal (iOS Simulator / Android emulator GPX).

## Nem cél (YAGNI)

Hangos navigáció, offline térkép, mentett helyek, köztes megállók, sávasszisztens,
sebességkorlátozás-kijelzés, forgalmi adatok, világos téma.
