import { config } from './config';

test('mask fractions and opacities line up, outermost is fully black at the outer radius', () => {
  expect(config.maskFractions).toHaveLength(config.maskOpacities.length);
  expect([...config.maskFractions]).toEqual([...config.maskFractions].sort((a, b) => a - b));
  expect(config.maskFractions[config.maskFractions.length - 1]).toBe(1);
  expect(config.maskOpacities[config.maskOpacities.length - 1]).toBe(1);
});

test('only free open-source endpoints over https', () => {
  expect(config.tileJsonUrl).toBe('https://tiles.openfreemap.org/planet');
  expect(config.valhallaUrl).toBe('https://valhalla1.openstreetmap.de/route');
  expect(config.nominatimUrl).toBe('https://nominatim.openstreetmap.org/search');
});
