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
