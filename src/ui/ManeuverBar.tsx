import { StyleSheet, Text, View } from 'react-native';
import type { Progress } from '../nav/progress';
import { theme } from '../theme';
import type { Route } from '../types';
import { formatDistance } from './format';
import { maneuverText } from './maneuverText';

export function ManeuverBar({ route, progress, arrived }: { route: Route; progress: Progress | null; arrived: boolean }) {
  if (arrived) {
    return (
      <View style={styles.wrap}>
        <Text style={styles.big}>You have arrived</Text>
      </View>
    );
  }
  const idx = progress?.nextStepIndex ?? Math.min(1, route.steps.length - 1);
  const step = route.steps[idx];
  const dist = progress?.distToManeuverM ?? step.beginDistM;
  return (
    <View style={styles.wrap}>
      <Text style={styles.big}>{formatDistance(dist)}</Text>
      <Text style={styles.text} numberOfLines={2}>{maneuverText(step)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 24, paddingVertical: 12 },
  big: { color: theme.fg, fontSize: 40, fontWeight: '200', fontVariant: ['tabular-nums'] },
  text: { color: theme.fg, fontSize: 20, fontWeight: '300', marginTop: 2 },
});
