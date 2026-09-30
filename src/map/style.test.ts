import { mapStyle } from './style';

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
