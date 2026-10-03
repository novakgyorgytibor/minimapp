import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

// A sáv: RINGS darab, egyenként STEP_PT vastag, egymásba ágyazott keret; kívül a legerősebb, befelé lágyan elhalványul
const RINGS = 24;
const STEP_PT = 2;
const EDGE_OPACITY = 0.55;
// A kijelző lekerekített sarkaihoz (kb. a mai iPhone-oké)
const CORNER_RADIUS = 55;
const PULSE_HALF_MS = 700;
const PULSE_MIN = 0.35;

// Lágy lecsengés: a széltől befelé gyorsan halványul, a belső vége szinte észrevétlenül fut ki
const ringOpacity = (i: number) => EDGE_OPACITY * (1 - i / RINGS) ** 2.5;

/**
 * Traffipax-figyelmeztetés: a képernyő szélei mentén lüktető fehér sáv, ami befelé elhalványul. Csak akkor van
 * felcsatolva, amikor kamera van előttünk (minden megjelenéskor friss animáció).
 */
export function CameraGlow() {
  const opacity = useRef(new Animated.Value(PULSE_MIN)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: PULSE_MIN, duration: PULSE_HALF_MS, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity }]} pointerEvents="none">
      {Array.from({ length: RINGS }, (_, i) => (
        <View
          key={i}
          style={[
            styles.ring,
            {
              top: i * STEP_PT,
              left: i * STEP_PT,
              right: i * STEP_PT,
              bottom: i * STEP_PT,
              borderRadius: Math.max(CORNER_RADIUS - i * STEP_PT, 0),
              borderColor: `rgba(255,255,255,${ringOpacity(i).toFixed(3)})`,
            },
          ]}
        />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', borderWidth: STEP_PT },
});
