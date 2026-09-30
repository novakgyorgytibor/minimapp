const smoothstep = (x: number) => x * x * (3 - 2 * x);

/**
 * Halványítás n egymásra rakott fekete maszkkal. A maszkok sugarai egyenletesen nőnek (fractions),
 * az átlátszóságuk (opacities) úgy van választva, hogy az összesített sötétedés egy lágy S-görbét
 * kövessen: középen alig, a szél felé fokozatosan – a legkülső (teljesen fekete) gyűrű előtt már
 * szinte minden fekete, így nem látszik éles kör.
 */
export function fadeSteps(n: number): { fractions: number[]; opacities: number[] } {
  const fractions = Array.from({ length: n }, (_, i) => (i + 1) / n);
  const coverage = fractions.map((f, i) => (i === n - 1 ? 1 : smoothstep(f)));
  const opacities = coverage.map((c, i) => {
    const prev = i === 0 ? 0 : coverage[i - 1];
    return prev >= 1 ? 1 : 1 - (1 - c) / (1 - prev);
  });
  return { fractions, opacities };
}
