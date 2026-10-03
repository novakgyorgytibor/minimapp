export type Lang = 'en' | 'hu';
export const LANGS: Lang[] = ['hu', 'en'];

const en = {
  whereTo: 'Where to?',
  cancel: 'Cancel',
  searching: 'Searching…',
  noResults: 'No results',
  noConnection: 'No connection',
  start: 'Start',
  droppedPin: 'Dropped pin',
  arrived: 'You have arrived',
  findingRoute: 'Finding route…',
  rerouting: 'Rerouting…',
  errNetwork: 'No connection · retry',
  errRateLimited: 'Server busy · retry',
  errNoRoute: 'No route found',
  errNoPosition: 'No GPS signal · retry',
  modeAuto: 'drive',
  modeBicycle: 'bike',
  modePedestrian: 'walk',
  permText: 'Navigation needs your location.',
  permAllow: 'Allow',
  permSettings: 'Settings',
  toll: 'tolls',
  cameraAhead: 'Speed camera',
  infoPrivacy: 'Privacy',
  infoContact: 'Contact',
  infoWebsite: 'Website',
  infoCoffee: 'Support me',
  infoCoffeeText: 'MinimApp is free and ad-free. If you find it useful, you can support it with a coffee.',
  close: 'Close',
};

export type StringKey = keyof typeof en;

const hu: Record<StringKey, string> = {
  whereTo: 'Hová?',
  cancel: 'Mégse',
  searching: 'Keresés…',
  noResults: 'Nincs találat',
  noConnection: 'Nincs kapcsolat',
  start: 'Indulás',
  droppedPin: 'Kijelölt pont',
  arrived: 'Megérkeztél',
  findingRoute: 'Útvonaltervezés…',
  rerouting: 'Újratervezés…',
  errNetwork: 'Nincs kapcsolat · újra',
  errRateLimited: 'A szerver túlterhelt · újra',
  errNoRoute: 'Nem található útvonal',
  errNoPosition: 'Nincs GPS jel · újra',
  modeAuto: 'autó',
  modeBicycle: 'bicikli',
  modePedestrian: 'gyalog',
  permText: 'A navigációhoz szükség van a pozíciódra.',
  permAllow: 'Engedélyezés',
  permSettings: 'Beállítások',
  toll: 'útdíjak',
  cameraAhead: 'Sebességmérő kamera',
  infoPrivacy: 'Adatvédelem',
  infoContact: 'Kapcsolat',
  infoWebsite: 'Weboldal',
  infoCoffee: 'Támogass',
  infoCoffeeText: 'A MinimApp ingyenes és reklámmentes. Ha hasznosnak találod, egy kávéval támogathatod.',
  close: 'Bezárás',
};

export const STRINGS: Record<Lang, Record<StringKey, string>> = { en, hu };

/** Első indításkor a telefon nyelve: magyar telefonon magyar, egyébként angol. */
export function defaultLang(locale: string | undefined): Lang {
  return locale?.toLowerCase().startsWith('hu') ? 'hu' : 'en';
}

/** Valhalla utasítás-nyelv. */
export const VALHALLA_LANGUAGE: Record<Lang, string> = { en: 'en-US', hu: 'hu-HU' };
