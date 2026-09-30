import { fadeSteps } from './fade';

const coverage = (opacities: number[]) => {
  let t = 1;
  return opacities.map((o) => 1 - (t *= 1 - o));
};

test('n steps, fractions evenly up to 1, outermost fully black', () => {
  const { fractions, opacities } = fadeSteps(12);
  expect(fractions).toHaveLength(12);
  expect(opacities).toHaveLength(12);
  expect(fractions[11]).toBe(1);
  expect(opacities[11]).toBe(1);
});

test('cumulative darkness follows a smooth S-curve (no hard edge before the outer ring)', () => {
  const c = coverage(fadeSteps(12).opacities);
  // monoton sötétedik
  for (let i = 1; i < c.length; i++) expect(c[i]).toBeGreaterThanOrEqual(c[i - 1]);
  // középen alig sötét, a külső gyűrű előtt már szinte teljesen
  expect(c[0]).toBeLessThan(0.05);
  expect(c[10]).toBeGreaterThan(0.95);
  // egyik lépcső sem ugrik 15%-nál többet
  for (let i = 1; i < c.length - 1; i++) expect(c[i] - c[i - 1]).toBeLessThan(0.15);
});
