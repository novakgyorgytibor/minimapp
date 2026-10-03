import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { theme } from '../theme';

// A korlát alatt halvány, túllépésnél teljes fényerővel lüktet
const CALM_OPACITY = 0.55;
const PULSE_HALF_MS = 600;
// JS-es animáció (nem natív): natív driverrel a leállított lüktetés utolsó (≈1) értéke néha visszaíródott a nézetre
// a setValue után, illetve elrejtés (korlát nélkül null) és újramegjelenítés után a nézet teljes fehéren ragadt.
const NATIVE = false;

/** Sebességkorlát-tábla: fehér keretes kör a számmal; a korlát alatt halvány, túllépésnél lüktet. */
export function SpeedLimitSign({ kmh, speeding }: { kmh: number | null; speeding: boolean }) {
  const opacity = useRef(new Animated.Value(CALM_OPACITY)).current;

  const active = kmh !== null && speeding;
  useEffect(() => {
    if (!active) {
      opacity.stopAnimation();
      opacity.setValue(CALM_OPACITY);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
        Animated.timing(opacity, { toValue: 0.25, duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [active, opacity]);

  if (kmh === null) return null;
  return (
    <Animated.View style={[styles.ring, { opacity }]} pointerEvents="none">
      <Text style={styles.value} adjustsFontSizeToFit numberOfLines={1}>
        {kmh}
      </Text>
    </Animated.View>
  );
}

const SIZE = 46;

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3,
    borderColor: theme.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { color: theme.fg, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'], paddingHorizontal: 3 },
});
