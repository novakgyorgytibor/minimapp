import { StyleSheet, Text, View } from 'react-native';
import { theme } from '../theme';

/** Sebességkorlát-tábla: fehér keretes kör a számmal (a minimál fekete-fehér stílusban). */
export function SpeedLimitSign({ kmh }: { kmh: number | null }) {
  if (kmh === null) return null;
  return (
    <View style={styles.ring} pointerEvents="none">
      <Text style={styles.value} adjustsFontSizeToFit numberOfLines={1}>
        {kmh}
      </Text>
    </View>
  );
}

const SIZE = 48;

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
  value: { color: theme.fg, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'], paddingHorizontal: 4 },
});
