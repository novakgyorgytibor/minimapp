import { createRateLimiter, searchNominatim, searchPhoton, searchPlaces } from './geocode';

test('rate limiter spaces calls at least minInterval apart', async () => {
  let t = 0;
  const waits: number[] = [];
  const now = () => t;
  const sleep = async (ms: number) => { waits.push(ms); t += ms; };
  const throttle = createRateLimiter(1000, now, sleep);
  await throttle(); // t=0, nincs várakozás
  await throttle(); // várni kell 1000-et
  t += 300;
  await throttle(); // az előző t=1000-kor ment, most t=1300 → 700 várakozás
  t += 5000;
  await throttle(); // régen volt, nincs várakozás
  expect(waits).toEqual([1000, 700]);
});

test('rate limiter serialises concurrent callers', async () => {
  const t = 0;
  const waits: number[] = [];
  const throttle = createRateLimiter(1000, () => t, async (ms) => { waits.push(ms); });
  await Promise.all([throttle(), throttle(), throttle()]);
  expect(waits).toEqual([1000, 2000]);
});

const nominatimResult = [
  {
    lat: '47.5068969',
    lon: '19.0650193',
    name: 'Terror Háza Múzeum',
    display_name: 'Terror Háza Múzeum, 60, Andrássy út, Terézváros, VI. kerület, Budapest, Közép-Magyarország, 1062, Magyarország',
  },
  { lat: '47.5', lon: '19.05', name: '', display_name: 'Andrássy út, Terézváros, Budapest, Magyarország' },
];

test('maps Nominatim results to places', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => nominatimResult, text: async () => '' }) as Response);
  const places = await searchNominatim('Andrássy út 60', [19.04, 47.5], undefined, { fetchImpl, throttle: async () => {} });
  expect(places[0]).toEqual({
    name: 'Terror Háza Múzeum',
    detail: '60, Andrássy út, Terézváros',
    coord: [19.0650193, 47.5068969],
  });
  expect(places[1].name).toBe('Andrássy út');
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('https://nominatim.openstreetmap.org/search?');
  expect(url).toContain('format=jsonv2');
  expect(url).toContain('accept-language=en');
  expect(url).toContain('q=Andr%C3%A1ssy+%C3%BAt+60');
  expect(url).toContain('viewbox=');
  expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^minimap/);
});

test('short queries do not hit the network', async () => {
  const fetchImpl = jest.fn();
  await expect(searchNominatim('  ab ', null, undefined, { fetchImpl, throttle: async () => {} })).resolves.toEqual([]);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('every search goes through the throttle', async () => {
  const throttle = jest.fn(async () => {});
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' }) as Response);
  await searchNominatim('Budapest', null, undefined, { fetchImpl, throttle });
  await searchNominatim('Budapest Keleti', null, undefined, { fetchImpl, throttle });
  expect(throttle).toHaveBeenCalledTimes(2);
});

test('search results follow the app language', async () => {
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' }) as Response);
  await searchNominatim('Budapest', null, undefined, { fetchImpl, throttle: async () => {} }, 'hu');
  expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain('accept-language=hu');
});

const photonResult = {
  type: 'FeatureCollection',
  features: [
    {
      type: 'Feature',
      properties: {
        osm_key: 'amenity', osm_value: 'university', type: 'house',
        name: 'Semmelweis Egyetem', street: 'Üllői út', housenumber: '26',
        district: 'Corvinnegyed', city: 'Budapest', country: 'Magyarország',
      },
      geometry: { type: 'Point', coordinates: [19.0818525, 47.4836969] },
    },
    {
      type: 'Feature',
      properties: { type: 'house', street: 'Villányi út', housenumber: '47', district: 'Szentimreváros', city: 'Budapest' },
      geometry: { type: 'Point', coordinates: [19.036, 47.4807] },
    },
  ],
};
const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as Response;

describe('Photon', () => {
  test('maps features to places (institution name, or street + number)', async () => {
    const fetchImpl = jest.fn(async () => json(photonResult));
    const places = await searchPhoton('Semmelw', [19.03, 47.48], undefined, { fetchImpl, throttle: async () => {} }, 'hu');
    expect(places[0]).toEqual({ name: 'Semmelweis Egyetem', detail: 'Üllői út 26, Corvinnegyed, Budapest', coord: [19.0818525, 47.4836969] });
    expect(places[1]).toEqual({ name: 'Villányi út 47', detail: 'Szentimreváros, Budapest', coord: [19.036, 47.4807] });
    const url = (fetchImpl.mock.calls[0] as unknown as [string])[0];
    expect(url).toContain('https://photon.komoot.io/api/?');
    expect(url).toContain('q=Semmelw');
    expect(url).toContain('lat=47.48');
    expect(url).toContain('lon=19.03');
    expect(url).not.toContain('lang='); // magyarul: eredeti (helyi) nevek
  });

  test('English UI asks for English labels', async () => {
    const fetchImpl = jest.fn(async () => json({ features: [] }));
    await searchPhoton('Budapest', null, undefined, { fetchImpl, throttle: async () => {} }, 'en');
    expect((fetchImpl.mock.calls[0] as unknown as [string])[0]).toContain('lang=en');
  });
});

describe('searchPlaces: Photon first, Nominatim as fallback', () => {
  const route = (photon: () => Response | Promise<Response>) =>
    jest.fn(async (url: string) => (url.includes('photon') ? photon() : json(nominatimResult)));

  test('uses Photon when it has results', async () => {
    const fetchImpl = route(() => json(photonResult));
    const places = await searchPlaces('Semmelw', null, undefined, { fetchImpl: fetchImpl as unknown as typeof fetch, throttle: async () => {} });
    expect(places[0].name).toBe('Semmelweis Egyetem');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('falls back to Nominatim when Photon returns nothing', async () => {
    const fetchImpl = route(() => json({ features: [] }));
    const places = await searchPlaces('Andrássy út 60', null, undefined, { fetchImpl: fetchImpl as unknown as typeof fetch, throttle: async () => {} });
    expect(places[0].name).toBe('Terror Háza Múzeum');
  });

  test('falls back to Nominatim when Photon fails', async () => {
    const fetchImpl = route(() => ({ ok: false, status: 502, json: async () => ({}), text: async () => '' }) as Response);
    const places = await searchPlaces('Andrássy út 60', null, undefined, {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      throttle: async () => {},
      retries: 0,
    });
    expect(places[0].name).toBe('Terror Háza Múzeum');
  });
});
