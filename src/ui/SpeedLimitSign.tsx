import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text } from 'react-native';
import { theme } from '../theme';

/** Sebességkorlát-tábla: kis fehér keretes kör a számmal; túllépésnél lassan lüktet. */
export function SpeedLimitSign({ kmh, speeding }: { kmh: number | null; speeding: boolean }) {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!speeding) {
      opacity.stopAnimation();
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.25, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [speeding, opacity]);

  if (kmh === null) return null;
  return (
    <Animated.View style={[styles.ring, { opacity }]} pointerEvents="none">
      <Text style={styles.value} adjustsFontSizeToFit numberOfLines={1}>
        {kmh}
      </Text>
    </Animated.View>
  );
}

const SIZE = 36;

const styles = StyleSheet.create({
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 2.5,
    borderColor: theme.fg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: { color: theme.fg, fontSize: 14, fontWeight: '600', fontVariant: ['tabular-nums'], paddingHorizontal: 3 },
});
