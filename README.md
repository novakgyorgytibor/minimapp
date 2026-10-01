# minimap

Minimalista, fekete-fehér navigáció. Csak ingyenes, nyílt forrású szolgáltatásokat használ:

- Térkép: [OpenFreeMap](https://openfreemap.org) (OpenMapTiles, © OpenStreetMap)
- Útvonal: [Valhalla](https://github.com/valhalla/valhalla) – FOSSGIS nyilvános szerver
- Keresés: [Photon](https://photon.komoot.io) (komoot, OSM-alapú, gépelés közben is talál), tartaléknak [Nominatim](https://nominatim.org) (max 1 kérés/s)

A végpontok a `src/config.ts`-ben állíthatók (pl. saját Valhalla/Nominatim szerverre).

## Futtatás

    npm install
    npx expo run:ios        # vagy: npx expo run:android
    npm test

Az Expo Go nem támogatott (natív MapLibre modul), dev build kell.

## Weboldal (Vercel)

A `website/` mappa egy statikus oldal (adatvédelem, App Store / Google Play összefoglalók, kapcsolat, támogatás), build nélkül.
A gyökérben lévő `vercel.json` miatt a Vercel nem telepít npm-csomagokat és nem buildel, csak a `website/` tartalmát szolgálja ki;
a `.vercelignore` miatt az app forrása fel sem töltődik.

- Telepítés: Vercelen *Add New → Project* → a GitHub repo importálása (minden beállítás maradhat alapértelmezett), vagy parancssorból `npx vercel --prod`.
- Rövid címek: `/privacy`, `/apple`, `/google`, `/contact`, `/support`, `/coffee` → a megfelelő oldalra irányít (az áruházakba adatvédelmi URL-nek a `/privacy` jó).
- Ha a domain nem `theminimapp.vercel.app`, az appban a `src/config.ts` → `websiteUrl` értékét is át kell írni.
