import { createRateLimiter, searchPlaces } from './geocode';

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
  const places = await searchPlaces('Andrássy út 60', [19.04, 47.5], undefined, { fetchImpl, throttle: async () => {} });
  expect(places[0]).toEqual({
    name: 'Terror Háza Múzeum',
    detail: '60, Andrássy út, Terézváros',
    coord: [19.0650193, 47.5068969],
  });
  expect(places[1].name).toBe('Andrássy út');
  const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toContain('https://nominatim.openstreetmap.org/search?');
  expect(url).toContain('format=jsonv2');
  expect(url).toContain('accept-language=hu');
  expect(url).toContain('q=Andr%C3%A1ssy+%C3%BAt+60');
  expect(url).toContain('viewbox=');
  expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^minimap/);
});

test('short queries do not hit the network', async () => {
  const fetchImpl = jest.fn();
  await expect(searchPlaces('  ab ', null, undefined, { fetchImpl, throttle: async () => {} })).resolves.toEqual([]);
  expect(fetchImpl).not.toHaveBeenCalled();
});

test('every search goes through the throttle', async () => {
  const throttle = jest.fn(async () => {});
  const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => [], text: async () => '' }) as Response);
  await searchPlaces('Budapest', null, undefined, { fetchImpl, throttle });
  await searchPlaces('Budapest Keleti', null, undefined, { fetchImpl, throttle });
  expect(throttle).toHaveBeenCalledTimes(2);
});
