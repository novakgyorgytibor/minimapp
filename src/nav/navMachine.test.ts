import { buildRoute } from '../services/route';
import type { LngLat } from '../types';
import { initialNavState, navReducer, type NavEvent, type NavState } from './navMachine';

const M_PER_DEG_LAT = 111_195;
const coords: LngLat[] = Array.from({ length: 10 }, (_, i) => [19 + i * 0.001, 47.5]);
const route = buildRoute(coords, 600, [
  { kind: 'depart', instruction: 'Start', streetNames: [], beginIndex: 0 },
  { kind: 'arrive', instruction: 'Arrive', streetNames: [], beginIndex: 9 },
]);
const dest: LngLat = [19.009, 47.5];
const off = (m: number): LngLat => [19.003, 47.5 + m / M_PER_DEG_LAT];

const run = (s: NavState, ...events: NavEvent[]) => events.reduce(navReducer, s);

function navigating(mode: NavState['mode'] = 'bicycle'): NavState {
  const s = run(initialNavState(mode), { type: 'SET_DEST', dest, label: 'Cél' });
  return run(s, { type: 'ROUTE_OK', route, requestId: s.requestId }, { type: 'START' });
}

test('search opens and closes', () => {
  const s = run(initialNavState(), { type: 'OPEN_SEARCH' });
  expect(s.phase).toBe('searching');
  expect(run(s, { type: 'CLOSE_SEARCH' }).phase).toBe('idle');
});

test('setting a destination starts a route request', () => {
  const s0 = initialNavState();
  const s = run(s0, { type: 'SET_DEST', dest, label: 'Cél' });
  expect(s).toMatchObject({ phase: 'preview', dest, destLabel: 'Cél', loading: true, route: null, error: null });
  expect(s.requestId).toBe(s0.requestId + 1);
});

test('route result is stored; START begins navigation', () => {
  let s = run(initialNavState(), { type: 'SET_DEST', dest, label: 'Cél' });
  s = run(s, { type: 'ROUTE_OK', route, requestId: s.requestId });
  expect(s).toMatchObject({ phase: 'preview', loading: false, route });
  s = run(s, { type: 'START' });
  expect(s.phase).toBe('navigating');
});

test('START without a route is ignored', () => {
  const s = run(initialNavState(), { type: 'SET_DEST', dest, label: 'Cél' }, { type: 'START' });
  expect(s.phase).toBe('preview');
});

test('stale route response (after CANCEL / new destination) is ignored', () => {
  const a = run(initialNavState(), { type: 'SET_DEST', dest, label: 'A' });
  const cancelled = run(a, { type: 'CANCEL' });
  expect(run(cancelled, { type: 'ROUTE_OK', route, requestId: a.requestId })).toEqual(cancelled);

  const b = run(a, { type: 'SET_DEST', dest: [19.1, 47.6], label: 'B' });
  const after = run(b, { type: 'ROUTE_OK', route, requestId: a.requestId });
  expect(after.route).toBeNull();
  expect(after.loading).toBe(true);
});

test('changing mode in preview re-requests the route', () => {
  let s = run(initialNavState('auto'), { type: 'SET_DEST', dest, label: 'Cél' });
  s = run(s, { type: 'ROUTE_OK', route, requestId: s.requestId });
  const id = s.requestId;
  s = run(s, { type: 'SET_MODE', mode: 'pedestrian' });
  expect(s).toMatchObject({ mode: 'pedestrian', loading: true, requestId: id + 1 });
});

test('route failure shows the error; RETRY re-requests', () => {
  let s = run(initialNavState(), { type: 'SET_DEST', dest, label: 'Cél' });
  s = run(s, { type: 'ROUTE_FAIL', error: 'network', requestId: s.requestId });
  expect(s).toMatchObject({ loading: false, error: 'network' });
  const id = s.requestId;
  s = run(s, { type: 'RETRY' });
  expect(s).toMatchObject({ loading: true, error: null, requestId: id + 1 });
});

test('missing GPS fix surfaces as no-position', () => {
  let s = run(initialNavState(), { type: 'SET_DEST', dest, label: 'Cél' });
  s = run(s, { type: 'ROUTE_FAIL', error: 'no-position', requestId: s.requestId });
  expect(s.error).toBe('no-position');
});

test('POSITION updates progress while navigating', () => {
  const s = run(navigating(), { type: 'POSITION', pos: [19.002, 47.5], now: 1000 });
  expect(s.progress?.distAlongM).toBeCloseTo(route.cumDistM[2], 0);
  expect(s.offRouteCount).toBe(0);
});

test('reroutes only after 3 consecutive off-route samples', () => {
  let s = navigating('bicycle');
  s = run(s, { type: 'POSITION', pos: off(60), now: 100_000 }, { type: 'POSITION', pos: off(60), now: 101_000 });
  expect(s.phase).toBe('navigating');
  expect(s.offRouteCount).toBe(2);
  const id = s.requestId;
  s = run(s, { type: 'POSITION', pos: off(60), now: 102_000 });
  expect(s).toMatchObject({ phase: 'rerouting', loading: true, requestId: id + 1, lastRerouteAt: 102_000 });
});

test('a single good fix resets the off-route counter (GPS jitter)', () => {
  let s = navigating('bicycle');
  s = run(
    s,
    { type: 'POSITION', pos: off(60), now: 100_000 },
    { type: 'POSITION', pos: off(60), now: 101_000 },
    { type: 'POSITION', pos: off(5), now: 102_000 },
    { type: 'POSITION', pos: off(60), now: 103_000 },
  );
  expect(s.phase).toBe('navigating');
  expect(s.offRouteCount).toBe(1);
});

test('pedestrian threshold is 25 m', () => {
  let s = navigating('pedestrian');
  s = run(s, ...[1, 2, 3].map((i): NavEvent => ({ type: 'POSITION', pos: off(30), now: 100_000 + i * 1000 })));
  expect(s.phase).toBe('rerouting');
  let b = navigating('bicycle');
  b = run(b, ...[1, 2, 3].map((i): NavEvent => ({ type: 'POSITION', pos: off(30), now: 100_000 + i * 1000 })));
  expect(b.phase).toBe('navigating');
});

test('no second reroute while rerouting, and min 10 s between reroutes', () => {
  let s = navigating('bicycle');
  s = run(s, ...[1, 2, 3].map((i): NavEvent => ({ type: 'POSITION', pos: off(60), now: 100_000 + i * 1000 })));
  expect(s.phase).toBe('rerouting');
  const id = s.requestId;
  s = run(s, ...[4, 5, 6, 7].map((i): NavEvent => ({ type: 'POSITION', pos: off(60), now: 100_000 + i * 1000 })));
  expect(s.requestId).toBe(id);

  s = run(s, { type: 'ROUTE_OK', route, requestId: id });
  expect(s).toMatchObject({ phase: 'navigating', offRouteCount: 0 });
  // 103 000-kor volt a reroute; 108 000-ig 3 rossz minta, de még nincs 10 s
  s = run(s, ...[6, 7, 8].map((i): NavEvent => ({ type: 'POSITION', pos: off(60), now: 100_000 + i * 1000 })));
  expect(s.phase).toBe('navigating');
  s = run(s, { type: 'POSITION', pos: off(60), now: 113_000 });
  expect(s.phase).toBe('rerouting');
});

test('failed reroute returns to navigating on the old route with the error', () => {
  let s = navigating('bicycle');
  s = run(s, ...[1, 2, 3].map((i): NavEvent => ({ type: 'POSITION', pos: off(60), now: 100_000 + i * 1000 })));
  s = run(s, { type: 'ROUTE_FAIL', error: 'network', requestId: s.requestId });
  expect(s).toMatchObject({ phase: 'navigating', route, error: 'network', offRouteCount: 0, loading: false });
});

test('arrives within 20 m of the route end', () => {
  const s = run(navigating(), { type: 'POSITION', pos: [19.00885, 47.5], now: 1 });
  expect(s.phase).toBe('arrived');
});

test('long press / destination is ignored while navigating', () => {
  const s = navigating();
  expect(run(s, { type: 'SET_DEST', dest: [20, 48], label: 'X' })).toEqual(s);
});

test('CANCEL resets to idle, keeps mode, bumps requestId', () => {
  const s = navigating('pedestrian');
  const c = run(s, { type: 'CANCEL' });
  expect(c).toMatchObject({ phase: 'idle', mode: 'pedestrian', route: null, dest: null, loading: false });
  expect(c.requestId).toBe(s.requestId + 1);
});

describe('fastest vs shortest alternative', () => {
  const alt = buildRoute([[19, 47.5], [19.004, 47.502], [19.009, 47.5]], 700, [
    { kind: 'depart', instruction: '', streetNames: [], beginIndex: 0 },
    { kind: 'arrive', instruction: '', streetNames: [], beginIndex: 2 },
  ]);

  function previewWithAlt(): NavState {
    const s = run(initialNavState('auto'), { type: 'SET_DEST', dest, label: 'Cél' });
    return run(s, { type: 'ROUTE_OK', route, alt, requestId: s.requestId });
  }

  test('preview keeps the fastest as selected and the shortest as alternative', () => {
    const s = previewWithAlt();
    expect(s).toMatchObject({ route, alt, pref: 'fast' });
  });

  test('SELECT_ALT swaps them and remembers the preference', () => {
    const s = run(previewWithAlt(), { type: 'SELECT_ALT' });
    expect(s).toMatchObject({ route: alt, alt: route, pref: 'short' });
    expect(run(s, { type: 'SELECT_ALT' })).toMatchObject({ route, alt, pref: 'fast' });
  });

  test('START navigates the selected one and hides the alternative', () => {
    const s = run(previewWithAlt(), { type: 'SELECT_ALT' }, { type: 'START' });
    expect(s).toMatchObject({ phase: 'navigating', route: alt, alt: null, pref: 'short' });
  });

  test('a new destination or mode resets to fastest without alternative', () => {
    const s = run(previewWithAlt(), { type: 'SELECT_ALT' });
    expect(run(s, { type: 'SET_DEST', dest, label: 'X' })).toMatchObject({ alt: null, pref: 'fast' });
    expect(run(s, { type: 'SET_MODE', mode: 'bicycle' })).toMatchObject({ alt: null, pref: 'fast' });
  });

  test('SELECT_ALT without an alternative or outside preview does nothing', () => {
    let s = run(initialNavState('auto'), { type: 'SET_DEST', dest, label: 'Cél' });
    s = run(s, { type: 'ROUTE_OK', route, requestId: s.requestId });
    expect(run(s, { type: 'SELECT_ALT' })).toEqual(s);
    expect(run(navigating(), { type: 'SELECT_ALT' })).toEqual(navigating());
  });
});
