import { mapStyle, pathOpacity } from './style';

test('black background, only road lines from OpenFreeMap', () => {
  expect(mapStyle.sources).toEqual({ omt: { type: 'vector', url: 'https://tiles.openfreemap.org/planet' } });
  const [bg, ...rest] = mapStyle.layers;
  expect(bg).toMatchObject({ type: 'background', paint: { 'background-color': '#000000' } });
  expect(rest.length).toBeGreaterThan(0);
  for (const l of rest) {
    expect(l.type).toBe('line');
    expect((l as { 'source-layer': string })['source-layer']).toBe('transportation');
    expect((l as { paint: Record<string, unknown> }).paint['line-color']).toBe('#555555');
  }
});

test('no labels, so no glyphs needed', () => {
  expect(mapStyle.layers.some((l) => l.type === 'symbol')).toBe(false);
  expect(mapStyle.glyphs).toBeUndefined();
});

test('footways / paths have their own layer, not mixed into minor roads', () => {
  const byId = Object.fromEntries(mapStyle.layers.map((l) => [l.id, l as { filter?: unknown }]));
  expect(byId['roads-path']).toBeDefined();
  expect(JSON.stringify(byId['roads-path'].filter)).toContain('"path"');
  expect(JSON.stringify(byId['roads-minor'].filter)).not.toContain('"path"');
});

test('paths are dimmer in drive mode only', () => {
  expect(pathOpacity('auto')).toBeLessThan(1);
  expect(pathOpacity('bicycle')).toBe(1);
  expect(pathOpacity('pedestrian')).toBe(1);
});
