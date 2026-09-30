import { config } from './config';

test('mask radii and opacities line up, outermost is fully black', () => {
  expect(config.maskRadiiM).toHaveLength(config.maskOpacities.length);
  expect([...config.maskRadiiM]).toEqual([...config.maskRadiiM].sort((a, b) => a - b));
  expect(config.maskOpacities[config.maskOpacities.length - 1]).toBe(1);
});

test('only free open-source endpoints over https', () => {
  expect(config.tileJsonUrl).toBe('https://tiles.openfreemap.org/planet');
  expect(config.valhallaUrl).toBe('https://valhalla1.openstreetmap.de/route');
  expect(config.nominatimUrl).toBe('https://nominatim.openstreetmap.org/search');
});
